/**
 * Retrieva Realtime Service
 *
 * Standalone Socket.io server extracted from:
 *   backend/services/socketService.js   (651 LOC)
 *   backend/services/presenceService.js (517 LOC)
 *
 * Responsibilities:
 *   - Authenticate WebSocket connections (JWT)
 *   - Manage Socket.io rooms (user, workspace, query)
 *   - Subscribe to Redis realtime:* channels published by the monolith
 *   - Forward events to connected clients
 *   - Track presence state in Redis (read by monolith's presenceService)
 *   - Deliver offline message queue
 *
 * Redis presence keys (written here, read by monolith presenceService.js):
 *   HASH  presence:user:{userId}                  — {status, lastSeen, name, connections}
 *   HASH  presence:workspace:{workspaceId}:members — {userId: json}
 *   HASH  presence:typing:{workspaceId}:{convId}   — {userId: json}
 *
 * Redis channels (subscribed here, published by monolith realtimeEvents.js):
 *   realtime:user:{userId}        — emit to user's personal room
 *   realtime:workspace:{wsId}     — emit to workspace room
 *   realtime:query:{queryId}      — emit to query room
 *   realtime:broadcast            — broadcast to all connected clients
 *
 * Port: 3010 (set via PORT env var)
 * Frontend connects to this service when NEXT_PUBLIC_WS_URL points here.
 */

import 'dotenv/config';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import IORedis from 'ioredis';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT) || 3010;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  console.error('[realtime-service] FATAL: JWT_ACCESS_SECRET not set');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// MongoDB — minimal models for auth lookups
// ---------------------------------------------------------------------------

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('[realtime-service] MONGODB_URI not set — socket auth will skip DB lookup');
    return;
  }
  await mongoose.connect(MONGODB_URI);
  console.log('[realtime-service] MongoDB connected');
}

const userSchema = new mongoose.Schema({ name: String, email: String, isActive: Boolean }, { strict: false });
const User = mongoose.model('User', userSchema);

const workspaceMemberSchema = new mongoose.Schema(
  { userId: mongoose.Schema.Types.ObjectId, workspaceId: mongoose.Schema.Types.ObjectId, status: String },
  { strict: false }
);
const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);

// ---------------------------------------------------------------------------
// Redis connections
// ---------------------------------------------------------------------------

function createRedis(name) {
  const r = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  r.on('error', (err) => console.error(`[realtime-service] Redis(${name}) error:`, err.message));
  r.on('connect', () => console.log(`[realtime-service] Redis(${name}) connected`));
  return r;
}

const redisPublish = createRedis('pub');  // For writing presence keys (HSET, DEL, EXPIRE)
const redisSub = createRedis('sub');      // Subscriber-only connection

// ---------------------------------------------------------------------------
// Presence TTL: keys expire 10s after last heartbeat so stale data self-cleans
// ---------------------------------------------------------------------------

const PRESENCE_TTL_SECONDS = 600; // 10 minutes

// ---------------------------------------------------------------------------
// Presence helpers (write to Redis)
// ---------------------------------------------------------------------------

async function setUserPresence(userId, data) {
  const key = `presence:user:${userId}`;
  await redisPublish.hset(key, data);
  await redisPublish.expire(key, PRESENCE_TTL_SECONDS);
}

async function deleteUserPresence(userId) {
  await redisPublish.del(`presence:user:${userId}`);
}

async function addWorkspaceMember(workspaceId, userId, data) {
  const key = `presence:workspace:${workspaceId}:members`;
  await redisPublish.hset(key, userId, JSON.stringify(data));
  await redisPublish.expire(key, PRESENCE_TTL_SECONDS);
}

async function removeWorkspaceMember(workspaceId, userId) {
  const key = `presence:workspace:${workspaceId}:members`;
  await redisPublish.hdel(key, userId);
  // Clean up empty key
  const size = await redisPublish.hlen(key);
  if (size === 0) await redisPublish.del(key);
}

async function setTypingUser(workspaceId, conversationId, userId, data) {
  const key = `presence:typing:${workspaceId}:${conversationId}`;
  await redisPublish.hset(key, userId, JSON.stringify(data));
  await redisPublish.expire(key, 30); // typing indicators expire after 30s
}

async function clearTypingUser(workspaceId, conversationId, userId) {
  const key = `presence:typing:${workspaceId}:${conversationId}`;
  await redisPublish.hdel(key, userId);
}

// ---------------------------------------------------------------------------
// In-memory state (per-process; presence mirrored to Redis)
// ---------------------------------------------------------------------------

// userId -> Set of socket IDs
const connectedUsers = new Map();

// socketId -> Set of room names (for cleanup on disconnect)
const socketRooms = new Map();

// Offline message queue: userId -> { messages: Array, createdAt: Date }
const offlineQueue = new Map();
const MAX_QUEUE_SIZE = 100;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const QUEUE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h

// userId -> Set of workspaceIds the user has explicitly joined for presence
const userPresenceWorkspaces = new Map();

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

function verifyToken(token) {
  return jwt.verify(token, JWT_ACCESS_SECRET);
}

function extractTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key) acc[key.trim()] = value?.trim();
    return acc;
  }, {});
  return cookies.accessToken || null;
}

// ---------------------------------------------------------------------------
// Socket.io server
// ---------------------------------------------------------------------------

const expressApp = express();
expressApp.use(express.json());

expressApp.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'realtime-service',
    connections: connectedUsers.size,
    ts: new Date().toISOString(),
  })
);

const httpServer = http.createServer(expressApp);

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      extractTokenFromCookie(socket.handshake.headers.cookie);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyToken(token);

    // DB lookup (optional — skip if MongoDB not connected)
    let userName = 'Unknown';
    let userEmail = '';
    let workspaceIds = [];

    if (mongoose.connection.readyState === 1) {
      const user = await User.findById(decoded.userId).select('name email isActive');
      if (!user) return next(new Error('User not found'));
      if (!user.isActive) return next(new Error('Account is inactive'));
      userName = user.name;
      userEmail = user.email;

      const memberships = await WorkspaceMember.find({
        userId: decoded.userId,
        status: 'active',
      }).select('workspaceId');
      workspaceIds = memberships.map((m) => m.workspaceId.toString());
    }

    socket.user = {
      userId: decoded.userId.toString(),
      email: userEmail,
      name: userName,
      workspaceIds,
    };

    next();
  } catch (error) {
    next(new Error(error.message || 'Authentication failed'));
  }
});

// ─── Connection handler ───────────────────────────────────────────────────────

io.on('connection', handleConnection);

async function handleConnection(socket) {
  const { userId, email, workspaceIds, name } = socket.user;

  console.log(`[realtime-service] Connected: userId=${userId} socketId=${socket.id} workspaces=${workspaceIds.length}`);

  // Track connected users (in-memory)
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socket.id);

  // Track dynamic rooms for cleanup
  socketRooms.set(socket.id, new Set());

  // Write online presence to Redis
  await setUserPresence(userId, {
    status: 'online',
    lastSeen: new Date().toISOString(),
    name,
    email,
    connections: connectedUsers.get(userId).size,
  }).catch((err) => console.error('[realtime-service] setUserPresence error:', err.message));

  // Join Socket.io rooms
  socket.join(`user:${userId}`);
  workspaceIds.forEach((wsId) => socket.join(`workspace:${wsId}`));

  // Deliver offline queue
  _deliverOfflineQueue(socket);

  // Emit connection success
  socket.emit('connected', { userId, workspaces: workspaceIds, timestamp: new Date().toISOString() });

  // Announce online to workspace peers
  workspaceIds.forEach((wsId) => {
    socket.to(`workspace:${wsId}`).emit('presence:online', {
      userId, name, timestamp: new Date().toISOString(),
    });
  });

  // ─── Query room events ──────────────────────────────────────────────────

  socket.on('join:query', (queryId) => {
    const roomName = `query:${queryId}`;
    socket.join(roomName);
    socketRooms.get(socket.id)?.add(roomName);
  });

  socket.on('leave:query', (queryId) => {
    const roomName = `query:${queryId}`;
    socket.leave(roomName);
    socketRooms.get(socket.id)?.delete(roomName);
  });

  // ─── Workspace room events ──────────────────────────────────────────────

  socket.on('join:workspace', async (workspaceId) => {
    if (mongoose.connection.readyState === 1) {
      const membership = await WorkspaceMember.findOne({
        userId, workspaceId, status: 'active',
      });
      if (!membership) return;
    }
    socket.join(`workspace:${workspaceId}`);
    socket.user.workspaceIds.push(workspaceId);
  });

  // ─── Presence events ────────────────────────────────────────────────────

  socket.on('presence:join-workspace', async (workspaceId) => {
    if (mongoose.connection.readyState === 1) {
      const membership = await WorkspaceMember.findOne({
        userId, workspaceId, status: 'active',
      });
      if (!membership) return;
    }

    if (!userPresenceWorkspaces.has(userId)) {
      userPresenceWorkspaces.set(userId, new Set());
    }
    userPresenceWorkspaces.get(userId).add(workspaceId);

    await addWorkspaceMember(workspaceId, userId, {
      userId, name, email, status: 'online', joinedAt: new Date().toISOString(),
    }).catch(() => {});

    // Notify workspace members
    io.to(`workspace:${workspaceId}`).emit('presence:joined-workspace', {
      userId, name, status: 'online', timestamp: new Date().toISOString(),
    });

    // Send current presence state back to the joining user
    try {
      const members = await redisPublish.hgetall(`presence:workspace:${workspaceId}:members`) || {};
      const users = Object.values(members).map((v) => JSON.parse(v));
      socket.emit('presence:update', { workspaceId, onlineCount: users.length, users });
    } catch {
      socket.emit('presence:update', { workspaceId, onlineCount: 0, users: [] });
    }
  });

  socket.on('presence:leave-workspace', async (workspaceId) => {
    userPresenceWorkspaces.get(userId)?.delete(workspaceId);
    await removeWorkspaceMember(workspaceId, userId).catch(() => {});
    io.to(`workspace:${workspaceId}`).emit('presence:left-workspace', {
      userId, name, timestamp: new Date().toISOString(),
    });
  });

  socket.on('presence:status', async (status) => {
    const validStatuses = ['online', 'away', 'busy', 'offline'];
    if (!validStatuses.includes(status)) return;

    await setUserPresence(userId, { status, lastSeen: new Date().toISOString() }).catch(() => {});

    // Notify all workspaces the user is viewing
    const workspaces = userPresenceWorkspaces.get(userId) || new Set();
    for (const wsId of workspaces) {
      io.to(`workspace:${wsId}`).emit('presence:status-changed', {
        userId, newStatus: status, timestamp: new Date().toISOString(),
      });
    }
  });

  socket.on('presence:typing-start', async ({ workspaceId, conversationId }) => {
    await setTypingUser(workspaceId, conversationId, userId, {
      userId, name, startedAt: new Date().toISOString(),
    }).catch(() => {});

    io.to(`workspace:${workspaceId}`).emit('presence:typing-start', {
      userId, name, conversationId, timestamp: new Date().toISOString(),
    });
  });

  socket.on('presence:typing-stop', async ({ workspaceId, conversationId }) => {
    await clearTypingUser(workspaceId, conversationId, userId).catch(() => {});

    io.to(`workspace:${workspaceId}`).emit('presence:typing-stop', {
      userId, name, conversationId, timestamp: new Date().toISOString(),
    });
  });

  socket.on('presence:get', async (workspaceId) => {
    try {
      const members = await redisPublish.hgetall(`presence:workspace:${workspaceId}:members`) || {};
      const users = Object.values(members).map((v) => JSON.parse(v));
      socket.emit('presence:update', { workspaceId, onlineCount: users.length, users });
    } catch {
      socket.emit('presence:update', { workspaceId, onlineCount: 0, users: [] });
    }
  });

  // ─── Analytics events (delegated back to monolith via Redis) ────────────
  // These are no-ops until a dedicated analytics service is extracted.

  socket.on('analytics:subscribe', () => {
    console.log(`[realtime-service] analytics:subscribe from ${userId} (not supported in microservice mode)`);
  });

  socket.on('analytics:unsubscribe', () => {});

  socket.on('analytics:get', () => {
    socket.emit('analytics:metrics-update', {
      queries: null, health: null, timestamp: new Date().toISOString(),
      _note: 'analytics events not supported in realtime-service mode',
    });
  });

  // ─── Ping / health ──────────────────────────────────────────────────────

  socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

  // ─── Disconnect ─────────────────────────────────────────────────────────

  socket.on('disconnect', async (reason) => {
    console.log(`[realtime-service] Disconnected: userId=${userId} socketId=${socket.id} reason=${reason}`);

    // Leave tracked dynamic rooms
    const trackedRooms = socketRooms.get(socket.id);
    if (trackedRooms) {
      for (const roomName of trackedRooms) socket.leave(roomName);
      socketRooms.delete(socket.id);
    }

    // Update connected users
    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);

        // Remove from all presence workspaces
        const workspaces = userPresenceWorkspaces.get(userId) || new Set();
        for (const wsId of workspaces) {
          await removeWorkspaceMember(wsId, userId).catch(() => {});
          io.to(`workspace:${wsId}`).emit('presence:left-workspace', {
            userId, name, timestamp: new Date().toISOString(),
          });
        }
        userPresenceWorkspaces.delete(userId);

        // Remove user presence from Redis
        await deleteUserPresence(userId).catch(() => {});

        // Notify workspace peers offline
        workspaceIds.forEach((wsId) => {
          io.to(`workspace:${wsId}`).emit('presence:offline', {
            userId, name, timestamp: new Date().toISOString(),
          });
        });
      } else {
        // Still has other connections — update connection count
        await setUserPresence(userId, { connections: userSockets.size }).catch(() => {});
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

function _queueOfflineMessage(userId, event, data) {
  if (!offlineQueue.has(userId)) {
    offlineQueue.set(userId, { messages: [], createdAt: new Date() });
  }
  const entry = offlineQueue.get(userId);
  if (entry.messages.length >= MAX_QUEUE_SIZE) entry.messages.shift();
  entry.messages.push({ event, data: { ...data, queuedAt: new Date().toISOString() } });
}

function _deliverOfflineQueue(socket) {
  const { userId } = socket.user;
  const entry = offlineQueue.get(userId);
  if (!entry || entry.messages.length === 0) return;

  // Atomically take the queue
  offlineQueue.delete(userId);
  const deliveryId = `${userId}-${Date.now()}`;

  console.log(`[realtime-service] Delivering offline queue: userId=${userId} size=${entry.messages.length}`);

  entry.messages.forEach(({ event, data }, index) => {
    socket.emit(event, { ...data, wasQueued: true, deliveryId, messageIndex: index });
  });
}

function _isUserOnline(userId) {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}

// Stale queue cleanup
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, entry] of offlineQueue.entries()) {
    if (now - entry.createdAt.getTime() > MAX_QUEUE_AGE_MS) {
      offlineQueue.delete(userId);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[realtime-service] Cleaned ${cleaned} stale offline queues`);
}, QUEUE_CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Redis pub/sub subscriber
// Receives events published by monolith's realtimeEvents.js and forwards
// them to the appropriate Socket.io rooms.
// ---------------------------------------------------------------------------

function initRealtimeSubscriber() {
  redisSub.psubscribe('realtime:*', (err) => {
    if (err) {
      console.error('[realtime-service] Failed to subscribe to realtime:*:', err.message);
    } else {
      console.log('[realtime-service] Subscribed to realtime:* Redis channels');
    }
  });

  redisSub.on('pmessage', (_pattern, channel, rawMessage) => {
    let parsed;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      console.error('[realtime-service] Invalid realtime message JSON on channel:', channel);
      return;
    }

    const { event, data } = parsed;
    const parts = channel.split(':');
    const type = parts[1];
    const id = parts.slice(2).join(':');

    switch (type) {
      case 'user':
        // Deliver to user room; queue if offline
        if (_isUserOnline(id)) {
          io.to(`user:${id}`).emit(event, data);
        } else {
          _queueOfflineMessage(id, event, data);
        }
        break;

      case 'workspace':
        io.to(`workspace:${id}`).emit(event, data);
        break;

      case 'query':
        io.to(`query:${id}`).emit(event, data);
        break;

      case 'broadcast':
        io.emit(event, data);
        break;

      default:
        console.warn('[realtime-service] Unknown realtime channel type:', channel);
    }
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

connectDB()
  .then(() => {
    initRealtimeSubscriber();

    httpServer.listen(PORT, () => {
      console.log(`[realtime-service] Running on :${PORT}`);
      console.log(`[realtime-service] Socket.io ready`);
      console.log(`[realtime-service] Frontend URL: ${FRONTEND_URL}`);
    });
  })
  .catch((err) => {
    console.error('[realtime-service] Startup failed:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[realtime-service] SIGTERM received, shutting down...');
  io.close();
  await redisPublish.quit().catch(() => {});
  await redisSub.quit().catch(() => {});
  process.exit(0);
});

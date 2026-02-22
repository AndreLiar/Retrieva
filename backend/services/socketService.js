/**
 * Socket / Realtime Service — Monolith Proxy
 *
 * When REALTIME_SERVICE_URL is set the standalone realtime-service handles
 * all Socket.io connections.  The monolith becomes a pure Redis publisher:
 *   emitToUser / emitToWorkspace / emitToQuery / broadcast
 *   → publish to the matching realtime:* Redis channel
 *
 * isUserOnline / getOnlineWorkspaceUsers read from the presence keys that
 * realtime-service writes to Redis.  Both functions are now ASYNC.
 *
 * initializeSocketServer is a no-op when REALTIME_SERVICE_URL is set.
 *
 * When REALTIME_SERVICE_URL is NOT set (local dev, no docker-compose) the
 * full in-process Socket.io server is used as a fallback — all existing
 * behaviour is preserved.
 *
 * @module services/socketService
 */

import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/security/jwt.js';
import { User } from '../models/User.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import * as presenceService from './presenceService.js';
import * as liveAnalyticsService from './liveAnalyticsService.js';
import { redisConnection, createRedisConnection } from '../config/redis.js';
import logger from '../config/logger.js';

const REALTIME_SERVICE_URL = process.env.REALTIME_SERVICE_URL;

// ---------------------------------------------------------------------------
// Remote path — pure Redis publisher
// ---------------------------------------------------------------------------

function publishEvent(channel, event, data) {
  redisConnection.publish(channel, JSON.stringify({ event, data })).catch((err) => {
    logger.error('Failed to publish socket event', {
      service: 'socket',
      channel,
      event,
      error: err.message,
    });
  });
}

const remote = {
  initializeSocketServer(_httpServer) {
    logger.info('Socket.io managed by realtime-service — skipping in-process server', {
      service: 'socket',
      url: REALTIME_SERVICE_URL,
    });
  },

  emitToUser(userId, event, data) {
    publishEvent(`realtime:user:${userId}`, event, data);
  },

  emitToWorkspace(workspaceId, event, data) {
    publishEvent(`realtime:workspace:${workspaceId}`, event, data);
  },

  emitToQuery(queryId, event, data) {
    publishEvent(`realtime:query:${queryId}`, event, data);
  },

  broadcast(event, data) {
    publishEvent('realtime:broadcast', event, data);
  },

  async isUserOnline(userId) {
    try {
      const status = await redisConnection.hget(`presence:user:${userId}`, 'status');
      return status === 'online' || status === 'away';
    } catch {
      return false;
    }
  },

  async getOnlineWorkspaceUsers(workspaceId) {
    try {
      const members = await redisConnection.hgetall(`presence:workspace:${workspaceId}:members`);
      if (!members) return [];
      return Object.keys(members);
    } catch {
      return [];
    }
  },

  getIO: () => null,

  getStats() {
    return { totalConnections: 0, uniqueUsers: 0, offlineQueueSize: 0, offlineQueueUsers: 0 };
  },
};

// ---------------------------------------------------------------------------
// Local path — full in-process Socket.io server (no docker-compose required)
// ---------------------------------------------------------------------------

// Socket.io server instance
let io = null;

// Connected users map: userId -> Set of socket IDs
const connectedUsers = new Map();

// ISSUE #32 FIX: Track dynamic rooms per socket for cleanup
const socketRooms = new Map();

// Offline message queue: userId -> { messages: Array, createdAt: Date }
const offlineQueue = new Map();

const MAX_QUEUE_SIZE = 100;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
const QUEUE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export function initializeSocketServer(httpServer) {
  if (REALTIME_SERVICE_URL) {
    return remote.initializeSocketServer(httpServer);
  }

  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        extractTokenFromCookie(socket.handshake.headers.cookie);

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyAccessToken(token);

      const user = await User.findById(decoded.userId).select('name email isActive');
      if (!user) return next(new Error('User not found'));
      if (!user.isActive) return next(new Error('Account is inactive'));

      const memberships = await WorkspaceMember.find({
        userId: decoded.userId,
        status: 'active',
      }).select('workspaceId');

      socket.user = {
        userId: decoded.userId.toString(),
        email: user.email,
        name: user.name,
        workspaceIds: memberships.map((m) => m.workspaceId.toString()),
      };

      next();
    } catch (error) {
      next(new Error(error.message || 'Authentication failed'));
    }
  });

  io.on('connection', handleConnection);

  // Redis pub/sub subscriber (forwards monolith-published events to sockets)
  _initRealtimeSubscriber();

  logger.info('Socket.io server initialized (in-process)', { service: 'socket' });

  return io;
}

function _initRealtimeSubscriber() {
  const sub = createRedisConnection();

  sub.psubscribe('realtime:*', (err) => {
    if (err) {
      logger.error('Failed to subscribe to realtime channels', {
        service: 'socket',
        error: err.message,
      });
    } else {
      logger.info('Subscribed to realtime Redis channels', { service: 'socket' });
    }
  });

  sub.on('pmessage', (_pattern, channel, rawMessage) => {
    if (!io) return;

    let parsed;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      logger.error('Invalid realtime message JSON', { service: 'socket', channel });
      return;
    }

    const { event, data } = parsed;
    const parts = channel.split(':');
    const type = parts[1];
    const id = parts.slice(2).join(':');

    switch (type) {
      case 'user':
        emitToUser(id, event, data);
        break;
      case 'workspace':
        emitToWorkspace(id, event, data);
        break;
      case 'query':
        emitToQuery(id, event, data);
        break;
      default:
        logger.warn('Unknown realtime channel type', { service: 'socket', channel });
    }
  });
}

function handleConnection(socket) {
  const { userId, email, workspaceIds } = socket.user;

  logger.info('Client connected', {
    service: 'socket',
    userId,
    email,
    socketId: socket.id,
    workspaces: workspaceIds.length,
  });

  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);
  socketRooms.set(socket.id, new Set());

  presenceService.userConnected(userId, socket.id, {
    name: socket.user.name,
    email: socket.user.email,
  });

  socket.join(`user:${userId}`);
  workspaceIds.forEach((wsId) => socket.join(`workspace:${wsId}`));

  deliverOfflineQueue(socket);

  socket.emit('connected', {
    userId,
    workspaces: workspaceIds,
    timestamp: new Date().toISOString(),
  });

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

  socket.on('join:workspace', async (workspaceId) => {
    const membership = await WorkspaceMember.findOne({ userId, workspaceId, status: 'active' });
    if (membership) {
      socket.join(`workspace:${workspaceId}`);
      socket.user.workspaceIds.push(workspaceId);
    }
  });

  socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

  // Presence events
  socket.on('presence:join-workspace', async (workspaceId) => {
    const membership = await WorkspaceMember.findOne({ userId, workspaceId, status: 'active' });
    if (membership) {
      await presenceService.joinWorkspace(userId, workspaceId, {
        name: socket.user.name,
        email: socket.user.email,
      });
      presenceService.syncPresenceToUser(userId, workspaceId);
    }
  });

  socket.on('presence:leave-workspace', (workspaceId) => {
    presenceService.leaveWorkspace(userId, workspaceId);
  });

  socket.on('presence:status', (status) => {
    if (Object.values(presenceService.UserStatus).includes(status)) {
      presenceService.updateUserStatus(userId, status);
    }
  });

  socket.on('presence:typing-start', ({ workspaceId, conversationId }) => {
    presenceService.startTyping(userId, workspaceId, conversationId, socket.user.name);
  });

  socket.on('presence:typing-stop', ({ workspaceId, conversationId }) => {
    presenceService.stopTyping(userId, workspaceId, conversationId);
  });

  socket.on('presence:get', (workspaceId) => {
    const presence = presenceService.getWorkspacePresence(workspaceId);
    socket.emit('presence:update', presence);
  });

  // Analytics events
  socket.on('analytics:subscribe', () => liveAnalyticsService.subscribeToAnalytics(userId));
  socket.on('analytics:unsubscribe', () => liveAnalyticsService.unsubscribeFromAnalytics(userId));

  socket.on('analytics:get', async () => {
    try {
      const [queryMetrics, systemHealth] = await Promise.all([
        liveAnalyticsService.getCurrentQueryMetrics(),
        liveAnalyticsService.getSystemHealth(),
      ]);
      socket.emit('analytics:metrics-update', {
        queries: queryMetrics,
        health: systemHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get analytics for socket', { error: error.message, userId });
    }
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    const trackedRooms = socketRooms.get(socket.id);
    if (trackedRooms) {
      for (const roomName of trackedRooms) socket.leave(roomName);
      socketRooms.delete(socket.id);
    }

    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) connectedUsers.delete(userId);
    }

    const isFullyOffline = presenceService.userDisconnected(userId, socket.id);

    if (isFullyOffline) {
      liveAnalyticsService.unsubscribeFromAnalytics(userId);
      workspaceIds.forEach((wsId) => {
        io.to(`workspace:${wsId}`).emit('presence:offline', {
          userId,
          name: socket.user.name,
          timestamp: new Date().toISOString(),
        });
      });
    }

    logger.info('Client disconnected', { service: 'socket', userId, socketId: socket.id, reason });
  });

  // Emit presence online to workspace peers
  workspaceIds.forEach((wsId) => {
    socket.to(`workspace:${wsId}`).emit('presence:online', {
      userId,
      name: socket.user.name,
      timestamp: new Date().toISOString(),
    });
  });
}

function extractTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  return cookies.accessToken || null;
}

function deliverOfflineQueue(socket) {
  const { userId } = socket.user;
  const queueEntry = offlineQueue.get(userId);
  if (!queueEntry || queueEntry.messages.length === 0) return;

  offlineQueue.delete(userId);
  const deliveryId = `${userId}-${Date.now()}`;

  logger.info('Delivering offline queue', {
    service: 'socket',
    userId,
    queueSize: queueEntry.messages.length,
    deliveryId,
  });

  queueEntry.messages.forEach(({ event, data }, index) => {
    socket.emit(event, { ...data, wasQueued: true, deliveryId, messageIndex: index });
  });
}

function queueOfflineMessage(userId, event, data) {
  if (!offlineQueue.has(userId)) {
    offlineQueue.set(userId, { messages: [], createdAt: new Date() });
  }
  const entry = offlineQueue.get(userId);
  if (entry.messages.length >= MAX_QUEUE_SIZE) entry.messages.shift();
  entry.messages.push({ event, data: { ...data, queuedAt: new Date().toISOString() } });
}

// ---------------------------------------------------------------------------
// Public exports — route to remote or local based on REALTIME_SERVICE_URL
// ---------------------------------------------------------------------------

export function isUserOnline(userId) {
  if (REALTIME_SERVICE_URL) return remote.isUserOnline(userId);
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}

export function getOnlineWorkspaceUsers(workspaceId) {
  if (REALTIME_SERVICE_URL) return remote.getOnlineWorkspaceUsers(workspaceId);
  const room = io?.sockets.adapter.rooms.get(`workspace:${workspaceId}`);
  if (!room) return [];
  const onlineUsers = new Set();
  room.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.user?.userId) onlineUsers.add(socket.user.userId);
  });
  return Array.from(onlineUsers);
}

export function emitToUser(userId, event, data, queueIfOffline = true) {
  if (REALTIME_SERVICE_URL) {
    remote.emitToUser(userId, event, data);
    return;
  }
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }
  if (isUserOnline(userId)) {
    io.to(`user:${userId}`).emit(event, data);
  } else if (queueIfOffline) {
    queueOfflineMessage(userId, event, data);
  }
}

export function emitToWorkspace(workspaceId, event, data) {
  if (REALTIME_SERVICE_URL) {
    remote.emitToWorkspace(workspaceId, event, data);
    return;
  }
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }
  io.to(`workspace:${workspaceId}`).emit(event, data);
}

export function emitToQuery(queryId, event, data) {
  if (REALTIME_SERVICE_URL) {
    remote.emitToQuery(queryId, event, data);
    return;
  }
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }
  io.to(`query:${queryId}`).emit(event, data);
}

export function broadcast(event, data) {
  if (REALTIME_SERVICE_URL) {
    remote.broadcast(event, data);
    return;
  }
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }
  io.emit(event, data);
}

export function getIO() {
  return REALTIME_SERVICE_URL ? null : io;
}

export function getStats() {
  if (REALTIME_SERVICE_URL) return remote.getStats();
  return {
    totalConnections: io?.sockets.sockets.size || 0,
    uniqueUsers: connectedUsers.size,
    offlineQueueSize: Array.from(offlineQueue.values()).reduce(
      (sum, q) => sum + q.messages.length,
      0
    ),
    offlineQueueUsers: offlineQueue.size,
  };
}

// ISSUE #17 FIX: Stale offline queue cleanup (local path only)
function cleanupStaleOfflineQueues() {
  if (REALTIME_SERVICE_URL) return;
  const now = Date.now();
  let cleanedCount = 0;
  for (const [userId, entry] of offlineQueue.entries()) {
    if (now - entry.createdAt.getTime() > MAX_QUEUE_AGE_MS) {
      offlineQueue.delete(userId);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    logger.info('Cleaned up stale offline queues', { service: 'socket', cleanedCount });
  }
}

setInterval(cleanupStaleOfflineQueues, QUEUE_CLEANUP_INTERVAL_MS);

if (REALTIME_SERVICE_URL) {
  logger.info('Socket service: using remote realtime-service (Redis publisher mode)', {
    service: 'socket',
    url: REALTIME_SERVICE_URL,
  });
} else {
  logger.info(
    'Socket service: using in-process Socket.io (set REALTIME_SERVICE_URL to use realtime-service)',
    {
      service: 'socket',
    }
  );
}

export const socketService = {
  initializeSocketServer,
  emitToUser,
  emitToWorkspace,
  emitToQuery,
  broadcast,
  isUserOnline,
  getOnlineWorkspaceUsers,
  getIO,
  getStats,
};

export default socketService;

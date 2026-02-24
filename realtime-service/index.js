/**
 * Retrieva Realtime Service — Composition Root
 *
 * Wires together all layers:
 *   domain/ports → infrastructure/adapters → application services → interface (Socket.io)
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
 */

import 'dotenv/config';
import http from 'http';
import express from 'express';
import IORedis from 'ioredis';
import mongoose from 'mongoose';

import { JwtTokenVerifier } from './src/infrastructure/adapters/JwtTokenVerifier.js';
import { RedisPresenceAdapter } from './src/infrastructure/adapters/RedisPresenceAdapter.js';
import { PresenceApplicationService } from './src/application/PresenceApplicationService.js';
import { OfflineQueueService } from './src/application/OfflineQueueService.js';
import { RealtimeSubscriberService } from './src/infrastructure/RealtimeSubscriberService.js';
import { createSocketServer } from './src/interface/socket/createSocketServer.js';

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
// Redis connections
// ---------------------------------------------------------------------------

function createRedis(name) {
  const r = new IORedis(REDIS_URL, { maxRetriesPerRequest: 3, enableOfflineQueue: true });
  r.on('error', (err) => console.error(`[realtime-service] Redis(${name}) error:`, err.message));
  r.on('connect', () => console.log(`[realtime-service] Redis(${name}) connected`));
  return r;
}
const redisPub = createRedis('pub');
const redisSub = createRedis('sub');

// ---------------------------------------------------------------------------
// MongoDB — minimal models for auth lookups
// ---------------------------------------------------------------------------

const userSchema = new mongoose.Schema({ name: String, email: String, isActive: Boolean }, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);
const workspaceMemberSchema = new mongoose.Schema(
  { userId: mongoose.Schema.Types.ObjectId, workspaceId: mongoose.Schema.Types.ObjectId, status: String },
  { strict: false }
);
const WorkspaceMember = mongoose.models.WorkspaceMember || mongoose.model('WorkspaceMember', workspaceMemberSchema);

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('[realtime-service] MONGODB_URI not set — skipping DB lookup in auth');
    return;
  }
  await mongoose.connect(MONGODB_URI);
  console.log('[realtime-service] MongoDB connected');
}

async function dbLookup({ userId }) {
  if (mongoose.connection.readyState !== 1) return { name: 'Unknown', email: '', workspaceIds: [] };
  const user = await User.findById(userId).select('name email isActive');
  if (!user || !user.isActive) return null;
  const memberships = await WorkspaceMember.find({ userId, status: 'active' }).select('workspaceId');
  return {
    name: user.name,
    email: user.email,
    workspaceIds: memberships.map((m) => m.workspaceId.toString()),
  };
}

// ---------------------------------------------------------------------------
// Compose layers
// ---------------------------------------------------------------------------

const tokenVerifier = new JwtTokenVerifier(JWT_ACCESS_SECRET);
const presenceStore = new RedisPresenceAdapter(redisPub);
const presenceService = new PresenceApplicationService({ presenceStore });
const offlineQueueService = new OfflineQueueService();
offlineQueueService.startCleanupInterval();

const expressApp = express();
expressApp.use(express.json());
expressApp.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'realtime-service',
    connections: presenceService.getConnectionCount(),
    ts: new Date().toISOString(),
  })
);

const httpServer = http.createServer(expressApp);

const io = createSocketServer(httpServer, {
  frontendUrl: FRONTEND_URL,
  tokenVerifier,
  presenceService,
  offlineQueueService,
  dbLookup,
});

const realtimeSubscriber = new RealtimeSubscriberService({
  redisSub,
  io,
  presenceService,
  offlineQueueService,
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

connectDB()
  .then(() => {
    realtimeSubscriber.init();
    httpServer.listen(PORT, () => {
      console.log(`[realtime-service] Running on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[realtime-service] Startup failed:', err.message);
    process.exit(1);
  });

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on('SIGTERM', async () => {
  offlineQueueService.stopCleanupInterval();
  io.close();
  await redisPub.quit().catch(() => {});
  await redisSub.quit().catch(() => {});
  process.exit(0);
});

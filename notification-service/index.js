/**
 * Retrieva Notification Service — Composition Root
 *
 * Wires domain, application, infrastructure, and interface layers together.
 * Each layer depends only on abstractions (ports), not on concretions.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { MongoNotificationRepository } from './src/infrastructure/adapters/MongoNotificationRepository.js';
import { MongoUserRepository } from './src/infrastructure/adapters/MongoUserRepository.js';
import { MongoWorkspaceMemberRepository } from './src/infrastructure/adapters/MongoWorkspaceMemberRepository.js';
import { RedisRealtimePublisher } from './src/infrastructure/adapters/RedisRealtimePublisher.js';
import { HttpEmailClient } from './src/infrastructure/adapters/HttpEmailClient.js';
import { NotificationApplicationService } from './src/application/NotificationApplicationService.js';
import { createApp } from './src/interface/http/createApp.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3009;
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

if (!MONGODB_URI) {
  console.error('[notification-service] FATAL: MONGODB_URI not set');
  process.exit(1);
}

// ── Infrastructure ────────────────────────────────────────────────────────────

const notificationRepo = new MongoNotificationRepository();
const userRepo = new MongoUserRepository();
const workspaceMemberRepo = new MongoWorkspaceMemberRepository();
const realtimePublisher = new RedisRealtimePublisher(REDIS_URL);
const emailClient = new HttpEmailClient({ emailServiceUrl: EMAIL_SERVICE_URL, internalApiKey: INTERNAL_API_KEY });

// ── Application ───────────────────────────────────────────────────────────────

const notificationService = new NotificationApplicationService({
  notificationRepo,
  userRepo,
  workspaceMemberRepo,
  realtimePublisher,
  emailClient,
  frontendUrl: FRONTEND_URL,
});

// ── Interface ─────────────────────────────────────────────────────────────────

const app = createApp({ notificationService, internalApiKey: INTERNAL_API_KEY });

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[notification-service] MongoDB connected');

  await realtimePublisher.connect();

  app.listen(PORT, () => {
    console.log(`[notification-service] Running on :${PORT}`);
    console.log(`[notification-service] Redis: ${REDIS_URL}`);
    console.log(`[notification-service] Email service: ${EMAIL_SERVICE_URL || 'not configured'}`);
  });
}

start().catch((err) => {
  console.error('[notification-service] Startup failed:', err.message);
  process.exit(1);
});

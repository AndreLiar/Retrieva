/**
 * Integration Tests — notification-service HTTP interface
 *
 * Tests against the notification-service Express app directly (not the monolith).
 * Uses MongoMemoryServer for real DB operations.
 * Mocks: Redis (RedisRealtimePublisher) and HTTP email client (HttpEmailClient).
 * Auth: uses X-User-Id header (the service trusts the monolith to have done JWT auth).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { MongoNotificationRepository } from '../../src/infrastructure/adapters/MongoNotificationRepository.js';
import { MongoUserRepository } from '../../src/infrastructure/adapters/MongoUserRepository.js';
import { MongoWorkspaceMemberRepository } from '../../src/infrastructure/adapters/MongoWorkspaceMemberRepository.js';
import { NotificationApplicationService } from '../../src/application/NotificationApplicationService.js';
import { createApp } from '../../src/interface/http/createApp.js';

describe('notification-service integration', () => {
  let mongoServer;
  let request;
  let userId;

  const mockRealtimePublisher = {
    publishToUser: vi.fn().mockResolvedValue(undefined),
    isUserOnline: vi.fn().mockResolvedValue(false),
  };

  const mockEmailClient = {
    send: vi.fn().mockResolvedValue({ success: true }),
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    await mongoose.connect(mongoServer.getUri());

    // Create a test user
    const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema(
      { email: String, name: String, notificationPreferences: mongoose.Schema.Types.Mixed },
      { strict: false }
    ));
    const user = await User.create({ email: 'test@example.com', name: 'Test User', notificationPreferences: {} });
    userId = user._id.toString();

    const notificationRepo = new MongoNotificationRepository();
    const userRepo = new MongoUserRepository();
    const workspaceMemberRepo = new MongoWorkspaceMemberRepository();

    const notificationService = new NotificationApplicationService({
      notificationRepo,
      userRepo,
      workspaceMemberRepo,
      realtimePublisher: mockRealtimePublisher,
      emailClient: mockEmailClient,
      frontendUrl: 'http://localhost:3000',
    });

    const app = createApp({ notificationService, internalApiKey: null });
    request = supertest(app);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const Notification = mongoose.models.Notification;
    if (Notification) await Notification.deleteMany({});
    vi.clearAllMocks();
  });

  // ── GET /health ────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 ok', async () => {
      const res = await request.get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ── GET /internal/notifications ───────────────────────────────────────────
  describe('GET /internal/notifications', () => {
    it('requires X-User-Id header', async () => {
      const res = await request.get('/internal/notifications');
      expect(res.status).toBe(400);
    });

    it('returns empty list for user with no notifications', async () => {
      const res = await request.get('/internal/notifications').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toHaveLength(0);
    });

    it('returns notifications for the user', async () => {
      const Notification = mongoose.models.Notification;
      await Notification.create({
        userId, type: 'sync_completed', title: 'Sync Done', message: 'All synced',
      });

      const res = await request.get('/internal/notifications').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toHaveLength(1);
      expect(res.body.data.notifications[0].title).toBe('Sync Done');
    });

    it('supports pagination', async () => {
      const res = await request
        .get('/internal/notifications')
        .query({ page: 1, limit: 10 })
        .set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.limit).toBe(10);
    });

    it('filters by unreadOnly', async () => {
      const Notification = mongoose.models.Notification;
      await Notification.create({ userId, type: 'system_alert', title: 'Unread', message: 'Test', isRead: false });
      await Notification.create({ userId, type: 'system_alert', title: 'Read', message: 'Test', isRead: true });

      const res = await request
        .get('/internal/notifications')
        .query({ unreadOnly: 'true' })
        .set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toHaveLength(1);
      expect(res.body.data.notifications[0].title).toBe('Unread');
    });
  });

  // ── GET /internal/notifications/count ─────────────────────────────────────
  describe('GET /internal/notifications/count', () => {
    it('requires X-User-Id header', async () => {
      const res = await request.get('/internal/notifications/count');
      expect(res.status).toBe(400);
    });

    it('returns 0 for user with no unread notifications', async () => {
      const res = await request.get('/internal/notifications/count').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(0);
    });

    it('returns correct count', async () => {
      const Notification = mongoose.models.Notification;
      await Notification.create([
        { userId, type: 'system_alert', title: 'A', message: 'M', isRead: false },
        { userId, type: 'system_alert', title: 'B', message: 'M', isRead: false },
      ]);

      const res = await request.get('/internal/notifications/count').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(2);
    });
  });

  // ── GET /internal/notifications/preferences ───────────────────────────────
  describe('GET /internal/notifications/preferences', () => {
    it('requires X-User-Id header', async () => {
      const res = await request.get('/internal/notifications/preferences');
      expect(res.status).toBe(400);
    });

    it('returns default preferences merged with user settings', async () => {
      const res = await request.get('/internal/notifications/preferences').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.preferences).toBeDefined();
      expect(res.body.data.preferences.inApp).toBeDefined();
      expect(res.body.data.preferences.email).toBeDefined();
    });
  });

  // ── PUT /internal/notifications/preferences ───────────────────────────────
  describe('PUT /internal/notifications/preferences', () => {
    it('requires X-User-Id header', async () => {
      const res = await request.put('/internal/notifications/preferences').send({});
      expect(res.status).toBe(400);
    });

    it('updates user preferences', async () => {
      const res = await request
        .put('/internal/notifications/preferences')
        .set('X-User-Id', userId)
        .send({ inApp: { member_joined: false }, email: { sync_failed: false } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── GET /internal/notifications/types ─────────────────────────────────────
  describe('GET /internal/notifications/types', () => {
    it('returns all notification types', async () => {
      const res = await request.get('/internal/notifications/types').set('X-User-Id', userId);
      expect(res.status).toBe(200);
      expect(res.body.data.types.length).toBeGreaterThan(0);
      expect(res.body.data.types[0]).toMatchObject({ key: expect.any(String), value: expect.any(String), description: expect.any(String) });
    });
  });

  // ── POST /internal/notifications/read ─────────────────────────────────────
  describe('POST /internal/notifications/read', () => {
    let notificationId;

    beforeEach(async () => {
      const Notification = mongoose.models.Notification;
      const n = await Notification.create({ userId, type: 'system_alert', title: 'Test', message: 'Test', isRead: false });
      notificationId = n._id.toString();
    });

    it('requires X-User-Id header', async () => {
      const res = await request.post('/internal/notifications/read').send({ all: true });
      expect(res.status).toBe(400);
    });

    it('marks specific notifications as read', async () => {
      const res = await request
        .post('/internal/notifications/read')
        .set('X-User-Id', userId)
        .send({ notificationIds: [notificationId] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('marks all notifications as read', async () => {
      const res = await request
        .post('/internal/notifications/read')
        .set('X-User-Id', userId)
        .send({ all: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when neither ids nor all is provided', async () => {
      const res = await request
        .post('/internal/notifications/read')
        .set('X-User-Id', userId)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── POST /internal/notifications/:id/mark-read ────────────────────────────
  describe('POST /internal/notifications/:id/mark-read', () => {
    let notificationId;

    beforeEach(async () => {
      const Notification = mongoose.models.Notification;
      const n = await Notification.create({ userId, type: 'system_alert', title: 'Test', message: 'Test', isRead: false });
      notificationId = n._id.toString();
    });

    it('marks notification as read', async () => {
      const res = await request
        .post(`/internal/notifications/${notificationId}/mark-read`)
        .set('X-User-Id', userId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notification.isRead).toBe(true);
    });

    it('returns 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .post(`/internal/notifications/${fakeId}/mark-read`)
        .set('X-User-Id', userId);

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /internal/notifications/:id ────────────────────────────────────
  describe('DELETE /internal/notifications/:id', () => {
    let notificationId;

    beforeEach(async () => {
      const Notification = mongoose.models.Notification;
      const n = await Notification.create({ userId, type: 'system_alert', title: 'Test', message: 'Test' });
      notificationId = n._id.toString();
    });

    it('deletes notification', async () => {
      const res = await request
        .delete(`/internal/notifications/${notificationId}`)
        .set('X-User-Id', userId);

      expect([200, 204]).toContain(res.status);

      const Notification = mongoose.models.Notification;
      const found = await Notification.findById(notificationId);
      expect(found).toBeNull();
    });

    it('returns 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .delete(`/internal/notifications/${fakeId}`)
        .set('X-User-Id', userId);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /internal/notify/deliver ─────────────────────────────────────────
  describe('POST /internal/notify/deliver', () => {
    it('creates and delivers notification', async () => {
      const res = await request.post('/internal/notify/deliver').send({
        userId,
        type: 'system_alert',
        title: 'Alert',
        message: 'Test alert',
        skipPreferenceCheck: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRealtimePublisher.publishToUser).toHaveBeenCalled();
    });
  });
});

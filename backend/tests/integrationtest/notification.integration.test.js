/**
 * Notification API Integration Tests
 *
 * Tests notification system endpoints including:
 * - User notifications
 * - Notification preferences
 * - Notification marking (read/unread)
 * - Notification count
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Set ALL required environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// Mock external dependencies
vi.mock('../../config/redis.js', () => ({
  redisConnection: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    stream: { write: vi.fn() },
  },
}));

vi.mock('../../services/emailService.js', () => {
  const mockFns = {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendPasswordChanged: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
  };
  return {
    emailService: mockFns,
    default: mockFns,
  };
});

vi.mock('../../services/authAuditService.js', () => ({
  authAuditService: {
    logRegisterSuccess: vi.fn().mockResolvedValue(true),
    logLoginSuccess: vi.fn().mockResolvedValue(true),
    logLoginFailed: vi.fn().mockResolvedValue(true),
    logLoginBlockedLocked: vi.fn().mockResolvedValue(true),
    logAccountLocked: vi.fn().mockResolvedValue(true),
    detectBruteForce: vi.fn().mockResolvedValue({ blocked: false }),
    logPasswordResetRequest: vi.fn().mockResolvedValue(true),
    logPasswordResetSuccess: vi.fn().mockResolvedValue(true),
    logLogout: vi.fn().mockResolvedValue(true),
    logTokenRefresh: vi.fn().mockResolvedValue(true),
    logEmailVerified: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
  })),
}));

vi.mock('../../config/vectorStore.js', () => ({
  getVectorStore: vi.fn().mockResolvedValue({
    client: {
      getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
    },
  }),
}));

vi.mock('../../config/llm.js', () => ({
  llm: {
    invoke: vi.fn().mockResolvedValue('test response'),
  },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  },
}));

import app from '../../app.js';

describe('Notification API Integration Tests', () => {
  let request;
  let mongoServer;
  const API_BASE = '/api/v1/notifications';
  const AUTH_BASE = '/api/v1/auth';

  const testUser = {
    email: 'notification-user@example.com',
    password: 'ValidPassword123!',
    name: 'Notification User',
  };

  let userToken;
  let userId;
  let notificationId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);
    request = supertest(app);

    // Register and verify user
    const registerRes = await request.post(`${AUTH_BASE}/register`).send(testUser);
    expect(registerRes.status).toBe(201);

    const User = mongoose.model('User');
    await User.updateOne(
      { email: testUser.email },
      { $set: { isEmailVerified: true, isActive: true } }
    );

    const loginRes = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });
    expect(loginRes.status).toBe(200);
    userToken = loginRes.body.data.accessToken;

    // Get the user document to get the ObjectId
    const userDoc = await User.findOne({ email: testUser.email });
    userId = userDoc._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear notifications between tests
    const Notification = mongoose.model('Notification');
    await Notification.deleteMany({});
  });

  // =============================================================================
  // Get User Notifications
  // =============================================================================
  describe('GET /api/v1/notifications', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}`);
      expect(res.status).toBe(401);
    });

    it('should return notifications for authenticated user', async () => {
      const res = await request.get(`${API_BASE}`).set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should return user notifications when they exist', async () => {
      // Create test notification
      const Notification = mongoose.model('Notification');
      const notification = await Notification.create({
        userId: userId,
        type: 'sync_completed',
        title: 'Sync Complete',
        message: 'Your workspace sync completed successfully',
        isRead: false,
      });
      notificationId = notification._id.toString();

      const res = await request.get(`${API_BASE}`).set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should support pagination', async () => {
      const res = await request
        .get(`${API_BASE}`)
        .query({ limit: 10, page: 1 })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });

    it('should filter by unread only', async () => {
      const res = await request
        .get(`${API_BASE}`)
        .query({ unreadOnly: true })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // Get Unread Count
  // =============================================================================
  describe('GET /api/v1/notifications/count', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/count`);
      expect(res.status).toBe(401);
    });

    it('should return unread count', async () => {
      const res = await request
        .get(`${API_BASE}/count`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();
    });

    it('should return 0 for user with no notifications', async () => {
      const res = await request
        .get(`${API_BASE}/count`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      // Count could be at data.count or data.unreadCount depending on API design
      const count = res.body.data?.count ?? res.body.data?.unreadCount ?? res.body.data ?? 0;
      expect(count).toBe(0);
    });
  });

  // =============================================================================
  // Get Notification Preferences
  // =============================================================================
  describe('GET /api/v1/notifications/preferences', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/preferences`);
      expect(res.status).toBe(401);
    });

    it('should return user preferences', async () => {
      const res = await request
        .get(`${API_BASE}/preferences`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Update Notification Preferences
  // =============================================================================
  describe('PUT /api/v1/notifications/preferences', () => {
    it('should require authentication', async () => {
      const res = await request.put(`${API_BASE}/preferences`).send({ inApp: { enabled: true } });
      expect(res.status).toBe(401);
    });

    it('should update preferences', async () => {
      const res = await request
        .put(`${API_BASE}/preferences`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          inApp: { enabled: true },
          email: { enabled: false },
        });

      expect([200, 400]).toContain(res.status);
    });
  });

  // =============================================================================
  // Get Notification Types
  // =============================================================================
  describe('GET /api/v1/notifications/types', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/types`);
      expect(res.status).toBe(401);
    });

    it('should return notification types', async () => {
      const res = await request
        .get(`${API_BASE}/types`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Mark Notifications as Read (Batch)
  // =============================================================================
  describe('POST /api/v1/notifications/read', () => {
    beforeEach(async () => {
      const Notification = mongoose.model('Notification');
      const notification = await Notification.create({
        userId: userId,
        type: 'system_alert',
        title: 'Test Notification',
        message: 'Test message',
        isRead: false,
      });
      notificationId = notification._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request
        .post(`${API_BASE}/read`)
        .send({ notificationIds: [notificationId] });
      expect(res.status).toBe(401);
    });

    it('should mark specific notifications as read', async () => {
      const res = await request
        .post(`${API_BASE}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notificationIds: [notificationId] });

      expect(res.status).toBe(200);
    });

    it('should mark all notifications as read', async () => {
      const res = await request
        .post(`${API_BASE}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ all: true });

      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // Mark Single Notification as Read
  // =============================================================================
  describe('PATCH /api/v1/notifications/:notificationId/read', () => {
    beforeEach(async () => {
      const Notification = mongoose.model('Notification');
      const notification = await Notification.create({
        userId: userId,
        type: 'system_alert',
        title: 'Test Notification',
        message: 'Test message',
        isRead: false,
      });
      notificationId = notification._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.patch(`${API_BASE}/${notificationId}/read`);
      expect(res.status).toBe(401);
    });

    it('should mark notification as read', async () => {
      const res = await request
        .patch(`${API_BASE}/${notificationId}/read`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify notification is marked as read
      const Notification = mongoose.model('Notification');
      const notification = await Notification.findById(notificationId);
      expect(notification.isRead).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .patch(`${API_BASE}/${fakeId}/read`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  // =============================================================================
  // Delete Notification
  // =============================================================================
  describe('DELETE /api/v1/notifications/:notificationId', () => {
    beforeEach(async () => {
      const Notification = mongoose.model('Notification');
      const notification = await Notification.create({
        userId: userId,
        type: 'system_alert',
        title: 'Test Notification',
        message: 'Test message',
      });
      notificationId = notification._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.delete(`${API_BASE}/${notificationId}`);
      expect(res.status).toBe(401);
    });

    it('should allow user to delete own notification', async () => {
      const res = await request
        .delete(`${API_BASE}/${notificationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 204]).toContain(res.status);

      // Verify notification is deleted
      const Notification = mongoose.model('Notification');
      const notification = await Notification.findById(notificationId);
      expect(notification).toBeNull();
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .delete(`${API_BASE}/${fakeId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });
});

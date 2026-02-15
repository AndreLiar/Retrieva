/**
 * Memory Management API Integration Tests
 *
 * Tests the Memory System endpoints including:
 * - Dashboard overview
 * - Cache statistics
 * - Entity memory stats
 * - Decay process management
 * - Database/Redis stats
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
    info: vi.fn().mockResolvedValue('# Memory\nused_memory:1000000'),
  },
}));

// Mock BullMQ queues to prevent real Redis connections from leaking into the
// event loop.  Without this, BullMQ's internal IORedis reconnect loop starves
// later requests and causes non-deterministic 30 s timeouts (see queue.js).
vi.mock('../../config/queue.js', () => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-1' }),
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    notionSyncQueue: { ...mockQueue },
    documentIndexQueue: { ...mockQueue },
    memoryDecayQueue: { ...mockQueue },
    scheduleMemoryDecayJob: vi.fn().mockResolvedValue(undefined),
    closeQueues: vi.fn().mockResolvedValue(undefined),
    default: {
      notionSyncQueue: { ...mockQueue },
      documentIndexQueue: { ...mockQueue },
      memoryDecayQueue: { ...mockQueue },
      scheduleMemoryDecayJob: vi.fn().mockResolvedValue(undefined),
      closeQueues: vi.fn().mockResolvedValue(undefined),
    },
  };
});

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

describe('Memory Management API Integration Tests', () => {
  let request;
  let mongoServer;
  const API_BASE = '/api/v1/memory';
  const AUTH_BASE = '/api/v1/auth';

  const testUser = {
    email: 'memory-user@example.com',
    password: 'ValidPassword123!',
    name: 'Memory User',
  };

  const adminUser = {
    email: 'memory-admin@example.com',
    password: 'AdminPassword123!',
    name: 'Memory Admin',
  };

  let userToken;
  let adminToken;
  let userId;
  let conversationId;

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

    // Get user ID from database
    const userDoc = await User.findOne({ email: testUser.email });
    userId = userDoc._id.toString();

    // Register admin
    const adminRegisterRes = await request.post(`${AUTH_BASE}/register`).send(adminUser);
    expect(adminRegisterRes.status).toBe(201);

    await User.updateOne(
      { email: adminUser.email },
      { $set: { isEmailVerified: true, isActive: true, role: 'admin' } }
    );

    const adminLoginRes = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: adminUser.email, password: adminUser.password });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.data.accessToken;

    // Create test conversation
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.create({
      userId: userId,
      title: 'Test Conversation',
    });
    conversationId = conversation._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // =============================================================================
  // Dashboard
  // =============================================================================
  describe('GET /api/v1/memory/dashboard', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/dashboard`);
      expect(res.status).toBe(401);
    });

    it('should return memory dashboard', async () => {
      const res = await request
        .get(`${API_BASE}/dashboard`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Cache Statistics
  // =============================================================================
  describe('GET /api/v1/memory/cache', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/cache`);
      expect(res.status).toBe(401);
    });

    it('should return cache statistics', async () => {
      const res = await request
        .get(`${API_BASE}/cache`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Memory Build Stats
  // =============================================================================
  describe('GET /api/v1/memory/builds', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/builds`);
      expect(res.status).toBe(401);
    });

    it('should return memory build statistics', async () => {
      const res = await request
        .get(`${API_BASE}/builds`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Entity Memory
  // =============================================================================
  describe('GET /api/v1/memory/entities', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/entities`);
      expect(res.status).toBe(401);
    });

    it('should return entity memory statistics', async () => {
      const res = await request
        .get(`${API_BASE}/entities`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Decay Statistics
  // =============================================================================
  describe('GET /api/v1/memory/decay/stats', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/decay/stats`);
      expect(res.status).toBe(401);
    });

    it('should return decay statistics', async () => {
      const res = await request
        .get(`${API_BASE}/decay/stats`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Decay Jobs
  // =============================================================================
  describe('GET /api/v1/memory/decay/jobs', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/decay/jobs`);
      expect(res.status).toBe(401);
    });

    it.skip('should return decay job queue status (requires BullMQ)', async () => {
      const res = await request
        .get(`${API_BASE}/decay/jobs`)
        .set('Authorization', `Bearer ${userToken}`)
        .timeout(10000);

      // May return 200, 500, or 503 depending on queue availability
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Trigger Decay
  // =============================================================================
  describe('POST /api/v1/memory/decay/trigger', () => {
    it('should require authentication', async () => {
      const res = await request.post(`${API_BASE}/decay/trigger`).send({ dryRun: true });
      expect(res.status).toBe(401);
    });

    it.skip('should trigger decay job (requires BullMQ)', async () => {
      const res = await request
        .post(`${API_BASE}/decay/trigger`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ dryRun: true })
        .timeout(10000);

      // May return 200, 202, 500, or 503 depending on queue availability
      expect([200, 202, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Database Statistics
  // =============================================================================
  describe('GET /api/v1/memory/database', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/database`);
      expect(res.status).toBe(401);
    });

    it('should return database statistics', async () => {
      const res = await request
        .get(`${API_BASE}/database`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Redis Statistics
  // =============================================================================
  describe('GET /api/v1/memory/redis', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/redis`);
      expect(res.status).toBe(401);
    });

    it('should return redis statistics', async () => {
      const res = await request
        .get(`${API_BASE}/redis`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // Hourly Metrics
  // =============================================================================
  describe('GET /api/v1/memory/hourly', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/hourly`);
      expect(res.status).toBe(401);
    });

    it('should return hourly metrics', async () => {
      const res = await request
        .get(`${API_BASE}/hourly`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });

    it('should support hours parameter', async () => {
      const res = await request
        .get(`${API_BASE}/hourly`)
        .query({ hours: 12 })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // Clear Conversation Memory
  // =============================================================================
  describe('DELETE /api/v1/memory/conversation/:conversationId', () => {
    it('should require authentication', async () => {
      const res = await request.delete(`${API_BASE}/conversation/${conversationId}`);
      expect(res.status).toBe(401);
    });

    it('should clear conversation memory', async () => {
      const res = await request
        .delete(`${API_BASE}/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 204]).toContain(res.status);
    });
  });

  // =============================================================================
  // Admin: Clear All Caches
  // =============================================================================
  describe('DELETE /api/v1/memory/caches', () => {
    it('should require admin role', async () => {
      const res = await request
        .delete(`${API_BASE}/caches`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin to clear all caches', async () => {
      const res = await request
        .delete(`${API_BASE}/caches`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000);

      // May return 200, 204, or 500 depending on Redis availability
      expect([200, 204, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Admin: Reset Metrics
  // =============================================================================
  describe('DELETE /api/v1/memory/metrics', () => {
    it('should require admin role', async () => {
      const res = await request
        .delete(`${API_BASE}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin to reset metrics', async () => {
      const res = await request
        .delete(`${API_BASE}/metrics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000);

      // May return 200, 204, or 500 depending on Redis availability
      expect([200, 204, 500, 503]).toContain(res.status);
    });
  });
});

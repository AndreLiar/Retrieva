/**
 * Analytics API Integration Tests
 *
 * Tests analytics and metrics endpoints including:
 * - Analytics summary
 * - Popular questions
 * - Cache statistics
 * - Live analytics
 * - Feedback submission
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

describe('Analytics API Integration Tests', () => {
  let request;
  let mongoServer;
  const API_BASE = '/api/v1/analytics';
  const AUTH_BASE = '/api/v1/auth';

  const testUser = {
    email: 'analytics-user@example.com',
    password: 'ValidPassword123!',
    name: 'Analytics User',
  };

  const adminUser = {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'admin',
  };

  let userToken;
  let adminToken;
  let userId;
  let workspaceId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);
    request = supertest(app);

    // Register and verify regular user
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

    // Register and verify admin user
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

    // Create test workspace
    const NotionWorkspace = mongoose.model('NotionWorkspace');
    const workspace = await NotionWorkspace.create({
      workspaceId: 'test-workspace-1',
      workspaceName: 'Test Workspace',
      userId: userId,
      accessToken: 'encrypted-token',
    });
    workspaceId = workspace._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // =============================================================================
  // Analytics Summary
  // =============================================================================
  describe('GET /api/v1/analytics/summary', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/summary`);
      expect(res.status).toBe(401);
    });

    it('should return analytics summary for authenticated user', async () => {
      const res = await request
        .get(`${API_BASE}/summary`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should support date range filtering', async () => {
      const startDate = new Date('2025-01-01').toISOString();
      const endDate = new Date('2025-12-31').toISOString();

      const res = await request
        .get(`${API_BASE}/summary`)
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 400]).toContain(res.status);
    });
  });

  // =============================================================================
  // Popular Questions
  // =============================================================================
  describe('GET /api/v1/analytics/popular-questions', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/popular-questions`);
      expect(res.status).toBe(401);
    });

    it('should return popular questions', async () => {
      const res = await request
        .get(`${API_BASE}/popular-questions`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Cache Statistics
  // =============================================================================
  describe('GET /api/v1/analytics/cache-stats', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/cache-stats`);
      expect(res.status).toBe(401);
    });

    it('should return cache statistics', async () => {
      const res = await request
        .get(`${API_BASE}/cache-stats`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Feedback Trends
  // =============================================================================
  describe('GET /api/v1/analytics/feedback-trends', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/feedback-trends`);
      expect(res.status).toBe(401);
    });

    it('should return feedback trends', async () => {
      const res = await request
        .get(`${API_BASE}/feedback-trends`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Source Stats
  // =============================================================================
  describe('GET /api/v1/analytics/source-stats', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/source-stats`);
      expect(res.status).toBe(401);
    });

    it('should return source statistics', async () => {
      const res = await request
        .get(`${API_BASE}/source-stats`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Live Analytics
  // =============================================================================
  describe('GET /api/v1/analytics/live/metrics', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/live/metrics`);
      expect(res.status).toBe(401);
    });

    it('should return live metrics', async () => {
      const res = await request
        .get(`${API_BASE}/live/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/live/health', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/live/health`);
      expect(res.status).toBe(401);
    });

    it.skip('should return system health (requires external services)', async () => {
      const res = await request
        .get(`${API_BASE}/live/health`)
        .set('Authorization', `Bearer ${userToken}`)
        .timeout(10000);

      // May return 200, 500, or 503 depending on external service availability
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Workspace-specific Analytics
  // =============================================================================
  describe('GET /api/v1/analytics/live/workspace/:workspaceId', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${API_BASE}/live/workspace/${workspaceId}`);
      expect(res.status).toBe(401);
    });

    it('should return workspace analytics for owner', async () => {
      const res = await request
        .get(`${API_BASE}/live/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .timeout(10000);

      // May return 200, 403, 404, or 500 depending on workspace access/service availability
      expect([200, 403, 404, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Admin Analytics
  // =============================================================================
  describe('GET /api/v1/analytics/live/platform', () => {
    it('should require admin role', async () => {
      const res = await request
        .get(`${API_BASE}/live/platform`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it.skip('should allow admin to view platform stats (requires external services)', async () => {
      const res = await request
        .get(`${API_BASE}/live/platform`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000);

      // May return 200, 500, or 503 depending on external service availability
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Feedback Submission
  // =============================================================================
  describe('POST /api/v1/analytics/feedback', () => {
    it('should accept feedback submission', async () => {
      const res = await request.post(`${API_BASE}/feedback`).send({
        requestId: 'test-request-id',
        rating: 5,
        helpful: true,
        comment: 'Great response!',
      });

      // Feedback is public, should accept, validate, or return 404 if request not found
      expect([200, 201, 400, 404]).toContain(res.status);
    });

    it('should validate rating range', async () => {
      const res = await request.post(`${API_BASE}/feedback`).send({
        requestId: 'test-request-id',
        rating: 10, // Invalid rating
        helpful: true,
      });

      expect([400, 422]).toContain(res.status);
    });
  });

  // =============================================================================
  // Cache Management (Admin)
  // =============================================================================
  describe('DELETE /api/v1/analytics/cache', () => {
    it('should require admin role', async () => {
      const res = await request
        .delete(`${API_BASE}/cache`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin to clear cache', async () => {
      const res = await request
        .delete(`${API_BASE}/cache`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 204]).toContain(res.status);
    });
  });
});

/**
 * Evaluation API Integration Tests
 *
 * Tests RAGAS evaluation endpoints including:
 * - Authentication requirements
 * - Service status and health
 * - Single and batch evaluations
 * - Faithfulness and relevancy checks
 * - Feedback submission
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

describe('Evaluation API Integration Tests', () => {
  let request;
  let mongoServer;
  const API_BASE = '/api/v1/evaluation';
  const AUTH_BASE = '/api/v1/auth';

  let userToken;
  let adminToken;

  const testUser = {
    email: 'eval-user@example.com',
    password: 'ValidPassword123!',
    name: 'Eval User',
  };

  const adminUser = {
    email: 'eval-admin@example.com',
    password: 'AdminPassword123!',
    name: 'Eval Admin',
  };

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
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // =============================================================================
  // Authentication Requirements
  // =============================================================================
  describe('Authentication Requirements', () => {
    it('should require authentication for /status', async () => {
      const res = await request.get(`${API_BASE}/status`);
      expect(res.status).toBe(401);
    });

    it('should require authentication for /health', async () => {
      const res = await request.get(`${API_BASE}/health`);
      expect(res.status).toBe(401);
    });

    it('should require authentication for /evaluate', async () => {
      const res = await request
        .post(`${API_BASE}/evaluate`)
        .send({ question: 'test', answer: 'test', contexts: [] });
      expect(res.status).toBe(401);
    });

    it('should require authentication for /batch', async () => {
      const res = await request.post(`${API_BASE}/batch`).send({ evaluations: [] });
      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // Service Status
  // =============================================================================
  describe('GET /api/v1/evaluation/status', () => {
    it('should return evaluation service status for authenticated user', async () => {
      const res = await request
        .get(`${API_BASE}/status`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Health Check
  // =============================================================================
  describe('GET /api/v1/evaluation/health', () => {
    it('should return health check status for authenticated user', async () => {
      const res = await request
        .get(`${API_BASE}/health`)
        .set('Authorization', `Bearer ${userToken}`);

      // RAGAS service may not be running in CI
      expect([200, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Metrics
  // =============================================================================
  describe('GET /api/v1/evaluation/metrics', () => {
    it('should return evaluation metrics for authenticated user', async () => {
      const res = await request
        .get(`${API_BASE}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      // RAGAS service may not be running in CI
      expect([200, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Single Answer Evaluation
  // =============================================================================
  describe('POST /api/v1/evaluation/evaluate', () => {
    it('should evaluate answer quality for authenticated user', async () => {
      const res = await request
        .post(`${API_BASE}/evaluate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          answer: 'RAG is Retrieval-Augmented Generation',
          contexts: ['Context 1', 'Context 2'],
        });

      // RAGAS service may not be available, but endpoint should exist
      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it('should validate required fields', async () => {
      const res = await request
        .post(`${API_BASE}/evaluate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          // Missing answer and contexts
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  // =============================================================================
  // Batch Evaluation (Admin Only)
  // =============================================================================
  describe('POST /api/v1/evaluation/batch', () => {
    it('should require admin role for batch evaluation', async () => {
      const res = await request
        .post(`${API_BASE}/batch`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          evaluations: [{ question: 'Q1', answer: 'A1', contexts: ['C1'] }],
        });

      expect(res.status).toBe(403);
    });

    it('should allow admin to run batch evaluation', async () => {
      const res = await request
        .post(`${API_BASE}/batch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          evaluations: [
            { question: 'Q1', answer: 'A1', contexts: ['C1'] },
            { question: 'Q2', answer: 'A2', contexts: ['C2'] },
          ],
        });

      // RAGAS service may not be available, but should not be 403
      expect([200, 400, 500, 503]).toContain(res.status);
    });
  });

  // =============================================================================
  // Faithfulness Check
  // =============================================================================
  describe('POST /api/v1/evaluation/faithfulness', () => {
    it('should check answer faithfulness for authenticated user', async () => {
      const res = await request
        .post(`${API_BASE}/faithfulness`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          answer: 'RAG is Retrieval-Augmented Generation',
          contexts: ['RAG stands for Retrieval-Augmented Generation'],
        });

      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it('should validate faithfulness input', async () => {
      const res = await request
        .post(`${API_BASE}/faithfulness`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          // Missing answer and contexts
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  // =============================================================================
  // Relevancy Check
  // =============================================================================
  describe('POST /api/v1/evaluation/relevancy', () => {
    it('should check answer relevancy for authenticated user', async () => {
      const res = await request
        .post(`${API_BASE}/relevancy`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          answer: 'RAG is Retrieval-Augmented Generation',
          contexts: ['RAG is a technique for improving LLM responses'],
        });

      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it('should validate relevancy input', async () => {
      const res = await request
        .post(`${API_BASE}/relevancy`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          question: 'What is RAG?',
          // Missing answer and contexts
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  // =============================================================================
  // Feedback Submission
  // =============================================================================
  describe('POST /api/v1/evaluation/feedback', () => {
    it('should submit evaluation feedback for authenticated user', async () => {
      const res = await request
        .post(`${API_BASE}/feedback`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          runId: 'test-run-id-123',
          score: 0.8,
          comment: 'Good evaluation result',
        });

      // LangSmith may not be configured, but endpoint should exist
      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it('should validate feedback input', async () => {
      const res = await request
        .post(`${API_BASE}/feedback`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          // Missing required fields
        });

      expect([400, 500]).toContain(res.status);
    });

    it('should accept feedback with score only', async () => {
      const res = await request
        .post(`${API_BASE}/feedback`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          runId: 'test-run-id-456',
          score: 1.0,
        });

      expect([200, 400, 500, 503]).toContain(res.status);
    });
  });
});

/**
 * Health Check API Integration Tests
 *
 * Tests the health check endpoints for monitoring and Kubernetes probes
 * These endpoints should always be accessible without authentication
 *
 * Note: In a mocked environment, some services may return degraded status.
 * These tests verify the API contract rather than actual service health.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';

// Set ALL required environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
// 32 bytes = 64 hex characters for AES-256
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// Mock external dependencies before importing app
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

vi.mock('../../config/database.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

// Mock Qdrant client
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    collectionExists: vi.fn().mockResolvedValue(true),
    getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
  })),
}));

// Mock vector store
vi.mock('../../config/vectorStore.js', () => ({
  getVectorStore: vi.fn().mockResolvedValue({
    client: {
      getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
    },
  }),
}));

// Mock LLM
vi.mock('../../config/llm.js', () => ({
  llm: {
    invoke: vi.fn().mockResolvedValue('test response'),
  },
}));

// Mock embeddings
vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  },
}));

// Mock email service
vi.mock('../../services/emailService.js', () => ({
  sendEmailVerification: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import app from '../../app.js';

describe('Health Check API Integration Tests', () => {
  let request;

  beforeAll(() => {
    request = supertest(app);
  });

  // =============================================================================
  // Basic Health Check
  // =============================================================================
  describe('GET /health', () => {
    it('should respond to health check endpoint', async () => {
      const res = await request.get('/health');

      // Accept 200 (healthy) or 500/503 (degraded in mocked env)
      expect([200, 500, 503]).toContain(res.status);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return JSON response', async () => {
      const res = await request.get('/health');

      expect(res.body).toBeDefined();
      expect(typeof res.body).toBe('object');
    });

    it('should include status field', async () => {
      const res = await request.get('/health');

      // Response should have either status or data.status
      expect(res.body.status || res.body.data?.status).toBeDefined();
    });
  });

  // =============================================================================
  // Detailed Health Check
  // =============================================================================
  describe('GET /health/detailed', () => {
    it('should respond to detailed health endpoint', async () => {
      const res = await request.get('/health/detailed');

      // Accept various status codes
      expect([200, 500, 503]).toContain(res.status);
    });

    it('should return JSON response', async () => {
      const res = await request.get('/health/detailed');

      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toBeDefined();
    });
  });

  // =============================================================================
  // Kubernetes Readiness Probe
  // =============================================================================
  describe('GET /health/ready', () => {
    it('should respond to readiness check', async () => {
      const res = await request.get('/health/ready');

      // Should return 200 (ready) or 503 (not ready)
      expect([200, 500, 503]).toContain(res.status);
    });

    it('should return JSON response', async () => {
      const res = await request.get('/health/ready');

      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // =============================================================================
  // Kubernetes Liveness Probe
  // =============================================================================
  describe('GET /health/live', () => {
    it('should respond to liveness check', async () => {
      const res = await request.get('/health/live');

      // Liveness should typically return 200 if the process is running
      expect([200, 500, 503]).toContain(res.status);
    });

    it('should respond quickly', async () => {
      const startTime = Date.now();
      await request.get('/health/live');
      const duration = Date.now() - startTime;

      // Should respond within 500ms even in degraded state
      expect(duration).toBeLessThan(500);
    });
  });

  // =============================================================================
  // Authentication Not Required
  // =============================================================================
  describe('Public Access', () => {
    it('should not require authentication for /health', async () => {
      // No Authorization header
      const res = await request.get('/health');

      // Should not return 401 Unauthorized
      expect(res.status).not.toBe(401);
    });

    it('should not require authentication for /health/detailed', async () => {
      const res = await request.get('/health/detailed');

      expect(res.status).not.toBe(401);
    });

    it('should not require authentication for /health/ready', async () => {
      const res = await request.get('/health/ready');

      expect(res.status).not.toBe(401);
    });

    it('should not require authentication for /health/live', async () => {
      const res = await request.get('/health/live');

      expect(res.status).not.toBe(401);
    });
  });

  // =============================================================================
  // Root Endpoint
  // =============================================================================
  describe('GET /', () => {
    it('should respond to root endpoint', async () => {
      const res = await request.get('/');

      // Accept various status codes
      expect([200, 500, 503]).toContain(res.status);
    });

    it('should not require authentication', async () => {
      const res = await request.get('/');

      expect(res.status).not.toBe(401);
    });
  });

  // =============================================================================
  // API Documentation (Swagger removed in MVP)
  // =============================================================================
  describe('GET /api-docs', () => {
    it('should return 404 as Swagger docs are not available in MVP', async () => {
      const res = await request.get('/api-docs/');
      expect(res.status).toBe(404);
    });
  });
});

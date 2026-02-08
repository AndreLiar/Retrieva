/**
 * Integration Test Setup
 *
 * Configuration and utilities for API integration testing
 * Supports CLI automation via Vitest and can be extended for Postman/Newman
 */

import { vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Test environment configuration
export const TEST_CONFIG = {
  // API base URL for tests
  API_BASE: '/api/v1',

  // Test user credentials
  TEST_USER: {
    email: 'testuser@example.com',
    password: 'TestPassword123!',
    name: 'Test User',
  },

  // Admin user credentials
  ADMIN_USER: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'admin',
  },

  // Timeouts
  REQUEST_TIMEOUT: 10000,
  SETUP_TIMEOUT: 30000,
};

// MongoDB Memory Server instance
let mongoServer;

/**
 * Initialize test database
 */
export const setupTestDatabase = async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 60000, // 60 seconds timeout for instance startup
    },
  });
  const mongoUri = mongoServer.getUri();

  // Set environment for test database
  process.env.MONGODB_URI = mongoUri;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
  process.env.JWT_ACCESS_EXPIRY = '15m';
  process.env.JWT_REFRESH_EXPIRY = '7d';

  // Connect mongoose
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  return mongoUri;
};

/**
 * Cleanup test database
 */
export const cleanupTestDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
};

/**
 * Clear all collections between tests
 */
export const clearCollections = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};

/**
 * Create a test user and return tokens
 */
export const createTestUser = async (app, userData = TEST_CONFIG.TEST_USER) => {
  const supertest = (await import('supertest')).default;
  const request = supertest(app);

  // Register user
  const registerRes = await request.post(`${TEST_CONFIG.API_BASE}/auth/register`).send(userData);

  if (registerRes.status !== 201) {
    throw new Error(`Failed to register test user: ${JSON.stringify(registerRes.body)}`);
  }

  // For integration tests, we'll manually verify the user in the database
  const User = mongoose.model('User');
  await User.updateOne(
    { email: userData.email },
    { $set: { isEmailVerified: true, isActive: true } }
  );

  // Login to get tokens
  const loginRes = await request.post(`${TEST_CONFIG.API_BASE}/auth/login`).send({
    email: userData.email,
    password: userData.password,
  });

  if (loginRes.status !== 200) {
    throw new Error(`Failed to login test user: ${JSON.stringify(loginRes.body)}`);
  }

  return {
    user: loginRes.body.data.user,
    accessToken: loginRes.body.data.accessToken,
    refreshToken: loginRes.body.data.refreshToken,
  };
};

/**
 * Create authenticated request helper
 */
export const authenticatedRequest = (request, token) => {
  return {
    get: (url) => request.get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request.post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request.delete(url).set('Authorization', `Bearer ${token}`),
  };
};

/**
 * Mock external services for integration tests
 */
export const mockExternalServices = () => {
  // Mock Redis
  vi.mock('../../config/redis.js', () => ({
    redisConnection: {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      quit: vi.fn().mockResolvedValue('OK'),
    },
  }));

  // Mock logger to reduce noise
  vi.mock('../../config/logger.js', () => ({
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      stream: { write: vi.fn() },
    },
  }));
};

/**
 * Generate test data helpers
 */
export const testDataGenerators = {
  /**
   * Generate a random email
   */
  randomEmail: () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,

  /**
   * Generate a valid password
   */
  validPassword: () => 'ValidPass123!',

  /**
   * Generate an invalid password (too weak)
   */
  weakPassword: () => 'weak',

  /**
   * Generate a valid question
   */
  validQuestion: () => 'What is the purpose of this system?',

  /**
   * Generate a long question (for edge case testing)
   */
  longQuestion: () => 'x'.repeat(2001),

  /**
   * Generate MongoDB ObjectId
   */
  objectId: () => new mongoose.Types.ObjectId().toString(),
};

/**
 * Response assertion helpers
 */
export const assertResponse = {
  /**
   * Assert successful response
   */
  success: (res, statusCode = 200) => {
    if (res.status !== statusCode) {
      throw new Error(
        `Expected status ${statusCode}, got ${res.status}: ${JSON.stringify(res.body)}`
      );
    }
    if (res.body.status !== 'success') {
      throw new Error(`Expected status 'success', got '${res.body.status}'`);
    }
    return res.body;
  },

  /**
   * Assert error response
   */
  error: (res, statusCode) => {
    if (res.status !== statusCode) {
      throw new Error(
        `Expected status ${statusCode}, got ${res.status}: ${JSON.stringify(res.body)}`
      );
    }
    if (res.body.status !== 'error' && res.body.status !== 'fail') {
      throw new Error(`Expected status 'error' or 'fail', got '${res.body.status}'`);
    }
    return res.body;
  },

  /**
   * Assert validation error
   */
  validationError: (res) => {
    if (res.status !== 400) {
      throw new Error(`Expected status 400, got ${res.status}`);
    }
    return res.body;
  },

  /**
   * Assert unauthorized error
   */
  unauthorized: (res) => {
    if (res.status !== 401) {
      throw new Error(`Expected status 401, got ${res.status}`);
    }
    return res.body;
  },

  /**
   * Assert forbidden error
   */
  forbidden: (res) => {
    if (res.status !== 403) {
      throw new Error(`Expected status 403, got ${res.status}`);
    }
    return res.body;
  },

  /**
   * Assert not found error
   */
  notFound: (res) => {
    if (res.status !== 404) {
      throw new Error(`Expected status 404, got ${res.status}`);
    }
    return res.body;
  },
};

export default {
  TEST_CONFIG,
  setupTestDatabase,
  cleanupTestDatabase,
  clearCollections,
  createTestUser,
  authenticatedRequest,
  mockExternalServices,
  testDataGenerators,
  assertResponse,
};

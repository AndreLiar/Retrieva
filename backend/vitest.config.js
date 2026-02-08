import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Global test timeout (increased for integration tests)
    testTimeout: 30000,
    hookTimeout: 60000, // Increased for MongoMemoryServer startup

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['utils/**/*.js', 'controllers/**/*.js', 'middleware/**/*.js'],
      exclude: ['node_modules', 'tests'],
    },

    // Mock configuration
    mockReset: true,
    clearMocks: true,

    // Reporter
    reporters: ['verbose'],

    // Run tests sequentially to avoid MongoMemoryServer conflicts
    // Each test file gets its own process (avoids model overwrite errors)
    fileParallelism: false,

    // Use forks pool - each file runs in separate process
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true, // Each file gets isolated process
      },
    },

    // Global setup - set env vars for tests
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-key-at-least-32-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-at-least-32-chars',
      RAGAS_SERVICE_URL: 'http://localhost:8001',
      // 32 bytes = 64 hex chars for AES-256 encryption
      ENCRYPTION_KEY: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    },
  },
});

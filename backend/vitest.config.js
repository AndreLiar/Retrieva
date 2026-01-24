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
    hookTimeout: 30000,

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

    // Global setup - set env vars for tests
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-key-at-least-32-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-at-least-32-chars',
    },
  },
});

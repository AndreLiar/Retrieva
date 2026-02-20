/**
 * Environment Validator Unit Tests
 *
 * Tests for environment variable validation at startup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, getEnvInfo } from '../../config/envValidator.js';

describe('Environment Validator', () => {
  // Store original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to known state before each test
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('validateEnv', () => {
    it('should pass with all required variables set', () => {
      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when JWT_ACCESS_SECRET is missing', () => {
      delete process.env.JWT_ACCESS_SECRET;

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_ACCESS_SECRET'))).toBe(true);
    });

    it('should fail when JWT_REFRESH_SECRET is missing', () => {
      delete process.env.JWT_REFRESH_SECRET;

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_REFRESH_SECRET'))).toBe(true);
    });

    it('should fail when MONGODB_URI is missing', () => {
      delete process.env.MONGODB_URI;

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('MONGODB_URI'))).toBe(true);
    });

    it('should fail when JWT secret is too short', () => {
      process.env.JWT_ACCESS_SECRET = 'short';

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least 32 characters'))).toBe(true);
    });

    it('should warn about missing recommended variables', () => {
      delete process.env.REDIS_URL;
      delete process.env.QDRANT_URL;

      const result = validateEnv();

      expect(result.valid).toBe(true); // Still valid
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should fail on recommended vars in strict mode', () => {
      delete process.env.REDIS_URL;

      const result = validateEnv({ strict: true });

      expect(result.valid).toBe(false);
    });

    it('should handle empty string as missing', () => {
      process.env.JWT_ACCESS_SECRET = '';

      const result = validateEnv();

      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-only as missing', () => {
      process.env.JWT_ACCESS_SECRET = '   ';

      const result = validateEnv();

      expect(result.valid).toBe(false);
    });

    it('should collect multiple errors', () => {
      delete process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      delete process.env.MONGODB_URI;

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('getEnvInfo', () => {
    it('should return environment configuration info', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '4000';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password';
      process.env.NOTION_CLIENT_ID = 'client-id';
      process.env.NOTION_CLIENT_SECRET = 'client-secret';

      const info = getEnvInfo();

      expect(info.nodeEnv).toBe('test');
      expect(info.port).toBe('4000');
      expect(info.mongoConfigured).toBe(true);
      expect(info.smtpConfigured).toBe(true);
      expect(info.notionConfigured).toBe(true);
    });

    it('should report false for unconfigured services', () => {
      delete process.env.REDIS_URL;
      delete process.env.QDRANT_URL;
      delete process.env.SMTP_USER;

      const info = getEnvInfo();

      expect(info.redisConfigured).toBe(false);
      expect(info.qdrantConfigured).toBe(false);
      expect(info.smtpConfigured).toBe(false);
    });

    it('should use defaults when not set', () => {
      delete process.env.NODE_ENV;
      delete process.env.PORT;

      const info = getEnvInfo();

      expect(info.nodeEnv).toBe('development');
      expect(info.port).toBe(3000);
    });
  });
});

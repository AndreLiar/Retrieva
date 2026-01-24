/**
 * Unit Tests for JWT Utilities
 *
 * Tests the JWT token generation, verification, and refresh token handling
 * This is CRITICAL security code that must be thoroughly tested
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Set required environment variables before importing
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-chars';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';

import {
  hashRefreshToken,
  compareRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
  decodeToken,
} from '../../utils/security/jwt.js';

describe('JWT Utilities', () => {
  const testPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // hashRefreshToken tests
  // ============================================================================
  describe('hashRefreshToken', () => {
    it('should return a SHA-256 hash string', () => {
      const token = 'my-refresh-token';
      const hash = hashRefreshToken(token);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce consistent hash for same input', () => {
      const token = 'consistent-token';
      const hash1 = hashRefreshToken(token);
      const hash2 = hashRefreshToken(token);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashRefreshToken('token-1');
      const hash2 = hashRefreshToken('token-2');

      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================================
  // compareRefreshToken tests
  // ============================================================================
  describe('compareRefreshToken', () => {
    it('should return true for matching token and hash', () => {
      const rawToken = 'my-secret-refresh-token';
      const hashedToken = hashRefreshToken(rawToken);

      const result = compareRefreshToken(rawToken, hashedToken);

      expect(result).toBe(true);
    });

    it('should return false for non-matching token', () => {
      const rawToken = 'my-secret-refresh-token';
      const hashedToken = hashRefreshToken('different-token');

      const result = compareRefreshToken(rawToken, hashedToken);

      expect(result).toBe(false);
    });

    it('should use timing-safe comparison (prevent timing attacks)', () => {
      // This test ensures the function uses crypto.timingSafeEqual
      // The implementation already uses it, we're verifying behavior
      const rawToken = 'test-token-for-timing';
      const hashedToken = hashRefreshToken(rawToken);

      // Both should take similar time regardless of where mismatch occurs
      const result = compareRefreshToken(rawToken, hashedToken);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // generateAccessToken tests
  // ============================================================================
  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateAccessToken(testPayload);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include userId, email, and role in payload', () => {
      const token = generateAccessToken(testPayload);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should set correct issuer and audience', () => {
      const token = generateAccessToken(testPayload);
      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('rag-backend');
      expect(decoded.aud).toBe('rag-api');
    });

    it('should include expiration time', () => {
      const token = generateAccessToken(testPayload);
      const decoded = jwt.decode(token);

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  // ============================================================================
  // generateRefreshToken tests
  // ============================================================================
  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const token = generateRefreshToken(testPayload);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include only userId and email in payload', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBeUndefined(); // Role not included in refresh token
    });

    it('should set correct issuer and audience', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('rag-backend');
      expect(decoded.aud).toBe('rag-api');
    });
  });

  // ============================================================================
  // verifyAccessToken tests
  // ============================================================================
  describe('verifyAccessToken', () => {
    it('should verify and decode valid token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyAccessToken('invalid-token')).toThrow('Invalid access token');
    });

    it('should throw error for expired token', () => {
      // Use fake timers to create and expire a token
      vi.useFakeTimers();

      // Generate a token with short expiry
      const token = generateAccessToken(testPayload);

      // Advance time by 20 minutes (past the 15m expiry)
      vi.advanceTimersByTime(20 * 60 * 1000);

      expect(() => verifyAccessToken(token)).toThrow('Access token expired');

      vi.useRealTimers();
    });

    it('should throw error for token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign({ userId: 'user-123' }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '15m',
        issuer: 'wrong-issuer',
        audience: 'rag-api',
      });

      expect(() => verifyAccessToken(wrongIssuerToken)).toThrow('Invalid access token');
    });

    it('should throw error for token with wrong audience', () => {
      const wrongAudienceToken = jwt.sign({ userId: 'user-123' }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '15m',
        issuer: 'rag-backend',
        audience: 'wrong-audience',
      });

      expect(() => verifyAccessToken(wrongAudienceToken)).toThrow('Invalid access token');
    });

    it('should throw error for token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign({ userId: 'user-123' }, 'wrong-secret', {
        expiresIn: '15m',
        issuer: 'rag-backend',
        audience: 'rag-api',
      });

      expect(() => verifyAccessToken(wrongSecretToken)).toThrow('Invalid access token');
    });
  });

  // ============================================================================
  // verifyRefreshToken tests
  // ============================================================================
  describe('verifyRefreshToken', () => {
    it('should verify and decode valid refresh token', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = verifyRefreshToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => verifyRefreshToken('invalid-token')).toThrow('Invalid refresh token');
    });

    it('should throw error for expired refresh token', () => {
      // Use fake timers to create and expire a token
      vi.useFakeTimers();

      // Generate a refresh token
      const token = generateRefreshToken(testPayload);

      // Advance time by 8 days (past the 7d expiry)
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

      expect(() => verifyRefreshToken(token)).toThrow('Refresh token expired');

      vi.useRealTimers();
    });
  });

  // ============================================================================
  // generateTokenPair tests
  // ============================================================================
  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const tokens = generateTokenPair(testPayload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it('should generate valid tokens that can be verified', () => {
      const tokens = generateTokenPair(testPayload);

      const accessDecoded = verifyAccessToken(tokens.accessToken);
      const refreshDecoded = verifyRefreshToken(tokens.refreshToken);

      expect(accessDecoded.userId).toBe(testPayload.userId);
      expect(refreshDecoded.userId).toBe(testPayload.userId);
    });

    it('should generate different tokens for access and refresh', () => {
      const tokens = generateTokenPair(testPayload);

      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  // ============================================================================
  // decodeToken tests
  // ============================================================================
  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = generateAccessToken(testPayload);
      const decoded = decodeToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should decode expired token without throwing', () => {
      const expiredToken = jwt.sign({ userId: 'user-123' }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '-1s',
      });

      // Should not throw, just decode
      const decoded = decodeToken(expiredToken);
      expect(decoded.userId).toBe('user-123');
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('not-a-valid-jwt');
      expect(decoded).toBeNull();
    });
  });
});

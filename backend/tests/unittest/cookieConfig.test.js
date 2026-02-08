/**
 * Unit Tests for Cookie Configuration
 *
 * Tests the secure cookie management for authentication tokens
 * Critical for XSS and CSRF protection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_OPTIONS,
  COOKIE_NAMES,
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
  getAccessToken,
  getRefreshToken,
} from '../../utils/security/cookieConfig.js';

describe('Cookie Configuration', () => {
  // ============================================================================
  // Cookie Options tests
  // ============================================================================
  describe('Cookie Options', () => {
    it('should have httpOnly flag set for access token', () => {
      expect(ACCESS_TOKEN_COOKIE_OPTIONS.httpOnly).toBe(true);
    });

    it('should have httpOnly flag set for refresh token', () => {
      expect(REFRESH_TOKEN_COOKIE_OPTIONS.httpOnly).toBe(true);
    });

    it('should have sameSite lax in non-production (strict in production)', () => {
      // In test/dev environments sameSite is 'lax' to allow cross-port requests;
      // production uses 'strict' for full CSRF protection.
      expect(ACCESS_TOKEN_COOKIE_OPTIONS.sameSite).toBe('lax');
      expect(REFRESH_TOKEN_COOKIE_OPTIONS.sameSite).toBe('lax');
    });

    it('should have correct maxAge for access token (15 minutes)', () => {
      expect(ACCESS_TOKEN_COOKIE_OPTIONS.maxAge).toBe(15 * 60 * 1000);
    });

    it('should have correct maxAge for refresh token (7 days)', () => {
      expect(REFRESH_TOKEN_COOKIE_OPTIONS.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should restrict refresh token to auth routes only', () => {
      expect(REFRESH_TOKEN_COOKIE_OPTIONS.path).toBe('/api/v1/auth');
    });

    it('should allow access token for all routes', () => {
      expect(ACCESS_TOKEN_COOKIE_OPTIONS.path).toBe('/');
    });
  });

  // ============================================================================
  // Cookie Names tests
  // ============================================================================
  describe('Cookie Names', () => {
    it('should have correct cookie names', () => {
      expect(COOKIE_NAMES.ACCESS_TOKEN).toBe('accessToken');
      expect(COOKIE_NAMES.REFRESH_TOKEN).toBe('refreshToken');
    });
  });

  // ============================================================================
  // setAuthCookies tests
  // ============================================================================
  describe('setAuthCookies', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        cookie: vi.fn(),
      };
    });

    it('should set both access and refresh token cookies', () => {
      const tokens = {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
      };

      setAuthCookies(mockRes, tokens);

      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
    });

    it('should set access token with correct options', () => {
      const tokens = {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
      };

      setAuthCookies(mockRes, tokens);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access-token-value',
        ACCESS_TOKEN_COOKIE_OPTIONS
      );
    });

    it('should set refresh token with correct options', () => {
      const tokens = {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
      };

      setAuthCookies(mockRes, tokens);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token-value',
        REFRESH_TOKEN_COOKIE_OPTIONS
      );
    });
  });

  // ============================================================================
  // setAccessTokenCookie tests
  // ============================================================================
  describe('setAccessTokenCookie', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        cookie: vi.fn(),
      };
    });

    it('should set only access token cookie', () => {
      setAccessTokenCookie(mockRes, 'new-access-token');

      expect(mockRes.cookie).toHaveBeenCalledTimes(1);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'accessToken',
        'new-access-token',
        ACCESS_TOKEN_COOKIE_OPTIONS
      );
    });
  });

  // ============================================================================
  // clearAuthCookies tests
  // ============================================================================
  describe('clearAuthCookies', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        clearCookie: vi.fn(),
      };
    });

    it('should clear both cookies', () => {
      clearAuthCookies(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('should clear access token with correct path', () => {
      clearAuthCookies(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        })
      );
    });

    it('should clear refresh token with correct path', () => {
      clearAuthCookies(mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/api/v1/auth',
        })
      );
    });
  });

  // ============================================================================
  // getAccessToken tests
  // ============================================================================
  describe('getAccessToken', () => {
    it('should get token from cookies first', () => {
      const mockReq = {
        cookies: {
          accessToken: 'cookie-token',
        },
        headers: {
          authorization: 'Bearer header-token',
        },
      };

      const token = getAccessToken(mockReq);

      expect(token).toBe('cookie-token');
    });

    it('should fallback to Authorization header', () => {
      const mockReq = {
        cookies: {},
        headers: {
          authorization: 'Bearer header-token',
        },
      };

      const token = getAccessToken(mockReq);

      expect(token).toBe('header-token');
    });

    it('should return null if no token found', () => {
      const mockReq = {
        cookies: {},
        headers: {},
      };

      const token = getAccessToken(mockReq);

      expect(token).toBeNull();
    });

    it('should handle missing cookies object', () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer header-token',
        },
      };

      const token = getAccessToken(mockReq);

      expect(token).toBe('header-token');
    });

    it('should ignore Authorization header without Bearer prefix', () => {
      const mockReq = {
        cookies: {},
        headers: {
          authorization: 'Basic some-credentials',
        },
      };

      const token = getAccessToken(mockReq);

      expect(token).toBeNull();
    });

    it('should extract token correctly after "Bearer "', () => {
      const mockReq = {
        cookies: {},
        headers: {
          authorization: 'Bearer my.jwt.token',
        },
      };

      const token = getAccessToken(mockReq);

      expect(token).toBe('my.jwt.token');
    });
  });

  // ============================================================================
  // getRefreshToken tests
  // ============================================================================
  describe('getRefreshToken', () => {
    it('should get token from cookies first', () => {
      const mockReq = {
        cookies: {
          refreshToken: 'cookie-refresh',
        },
        body: {
          refreshToken: 'body-refresh',
        },
      };

      const token = getRefreshToken(mockReq);

      expect(token).toBe('cookie-refresh');
    });

    it('should fallback to request body', () => {
      const mockReq = {
        cookies: {},
        body: {
          refreshToken: 'body-refresh',
        },
      };

      const token = getRefreshToken(mockReq);

      expect(token).toBe('body-refresh');
    });

    it('should return null if no token found', () => {
      const mockReq = {
        cookies: {},
        body: {},
      };

      const token = getRefreshToken(mockReq);

      expect(token).toBeNull();
    });

    it('should handle missing cookies and body', () => {
      const mockReq = {
        headers: {},
      };

      const token = getRefreshToken(mockReq);

      expect(token).toBeNull();
    });
  });
});

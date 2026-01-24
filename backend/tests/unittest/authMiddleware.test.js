/**
 * Unit Tests for Auth Middleware
 *
 * Tests the authentication and authorization middleware functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/security/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('../../models/User.js', () => ({
  User: {
    findById: vi.fn(),
  },
}));

vi.mock('../../utils/security/cookieConfig.js', () => ({
  getAccessToken: vi.fn(),
}));

import { authenticate, authorize, optionalAuth } from '../../middleware/auth.js';
import { verifyAccessToken } from '../../utils/security/jwt.js';
import { User } from '../../models/User.js';
import { getAccessToken } from '../../utils/security/cookieConfig.js';

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      path: '/test',
      ip: '127.0.0.1',
      headers: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  // ============================================================================
  // authenticate tests
  // ============================================================================
  describe('authenticate', () => {
    it('should return 401 when no token provided', async () => {
      getAccessToken.mockReturnValue(null);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      getAccessToken.mockReturnValue('invalid-token');
      verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found', async () => {
      getAccessToken.mockReturnValue('valid-token');
      verifyAccessToken.mockReturnValue({ userId: 'user-123' });
      User.findById.mockResolvedValue(null);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not found',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is inactive', async () => {
      getAccessToken.mockReturnValue('valid-token');
      verifyAccessToken.mockReturnValue({ userId: 'user-123' });
      User.findById.mockResolvedValue({
        _id: 'user-123',
        email: 'test@example.com',
        isActive: false,
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Account is inactive',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should attach user to request and call next on success', async () => {
      const mockUser = {
        _id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        isActive: true,
      };

      getAccessToken.mockReturnValue('valid-token');
      verifyAccessToken.mockReturnValue({ userId: 'user-123' });
      User.findById.mockResolvedValue(mockUser);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      getAccessToken.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication failed',
        })
      );
    });
  });

  // ============================================================================
  // authorize tests
  // ============================================================================
  describe('authorize', () => {
    it('should return 401 when no user attached', () => {
      const middleware = authorize('admin');

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
        })
      );
    });

    it('should return 403 when user role not in allowed roles', () => {
      mockReq.user = { userId: 'user-123', role: 'user' };
      const middleware = authorize('admin');

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Forbidden'),
        })
      );
    });

    it('should call next when user has required role', () => {
      mockReq.user = { userId: 'user-123', role: 'admin' };
      const middleware = authorize('admin');

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept multiple roles', () => {
      mockReq.user = { userId: 'user-123', role: 'user' };
      const middleware = authorize('admin', 'user');

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should include required roles in error message', () => {
      mockReq.user = { userId: 'user-123', role: 'user' };
      const middleware = authorize('admin', 'superadmin');

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('admin or superadmin'),
        })
      );
    });
  });

  // ============================================================================
  // optionalAuth tests
  // ============================================================================
  describe('optionalAuth', () => {
    it('should call next without user when no token', async () => {
      getAccessToken.mockReturnValue(null);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should attach user when valid token', async () => {
      const mockUser = {
        _id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
        isActive: true,
      };

      getAccessToken.mockReturnValue('valid-token');
      verifyAccessToken.mockReturnValue({ userId: 'user-123' });
      User.findById.mockResolvedValue(mockUser);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', async () => {
      getAccessToken.mockReturnValue('invalid-token');
      verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user when user is inactive', async () => {
      getAccessToken.mockReturnValue('valid-token');
      verifyAccessToken.mockReturnValue({ userId: 'user-123' });
      User.findById.mockResolvedValue({
        _id: 'user-123',
        isActive: false,
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue on unexpected error', async () => {
      getAccessToken.mockImplementation(() => {
        throw new Error('Unexpected');
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});

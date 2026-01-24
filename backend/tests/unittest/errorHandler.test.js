/**
 * Unit Tests for Error Handler
 *
 * Tests the error handling utilities including catchAsync wrapper,
 * AppError class, and global error handler middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger before importing the module
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { catchAsync, AppError, globalErrorHandler } from '../../utils/core/errorHandler.js';

describe('Error Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // AppError tests
  // ============================================================================
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 400);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
    });

    it('should set status to "fail" for 4xx errors', () => {
      const error400 = new AppError('Bad request', 400);
      expect(error400.status).toBe('fail');

      const error404 = new AppError('Not found', 404);
      expect(error404.status).toBe('fail');

      const error422 = new AppError('Unprocessable', 422);
      expect(error422.status).toBe('fail');
    });

    it('should set status to "error" for 5xx errors', () => {
      const error500 = new AppError('Server error', 500);
      expect(error500.status).toBe('error');

      const error503 = new AppError('Service unavailable', 503);
      expect(error503.status).toBe('error');
    });

    it('should set isOperational to true', () => {
      const error = new AppError('Test error', 400);
      expect(error.isOperational).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error', 400);
      expect(error.stack).toBeDefined();
      // Stack trace starts with error message and contains the test file
      expect(error.stack).toContain('Test error');
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test error', 400);
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ============================================================================
  // catchAsync tests
  // ============================================================================
  describe('catchAsync', () => {
    it('should return a function', () => {
      const fn = catchAsync(async () => {});
      expect(typeof fn).toBe('function');
    });

    it('should call the wrapped function with req, res, next', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      const wrappedFn = catchAsync(mockFn);

      const req = { body: {} };
      const res = { json: vi.fn() };
      const next = vi.fn();

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
    });

    it('should call next with error when wrapped function throws', async () => {
      const error = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const wrappedFn = catchAsync(mockFn);

      const req = { body: {} };
      const res = { json: vi.fn() };
      const next = vi.fn();

      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should not call next when wrapped function succeeds', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const wrappedFn = catchAsync(mockFn);

      const req = { body: {} };
      const res = { json: vi.fn() };
      const next = vi.fn();

      await wrappedFn(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it('should handle sync functions that return promises', async () => {
      const mockFn = () => Promise.resolve('result');
      const wrappedFn = catchAsync(mockFn);

      const req = { body: {} };
      const res = { json: vi.fn() };
      const next = vi.fn();

      await wrappedFn(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // globalErrorHandler tests
  // ============================================================================
  describe('globalErrorHandler', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        url: '/test',
        method: 'GET',
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      mockNext = vi.fn();
    });

    it('should set default statusCode to 500 if not provided', () => {
      const error = new Error('Test error');

      // Force development mode for this test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);

      process.env.NODE_ENV = originalEnv;
    });

    it('should use error statusCode if provided', () => {
      const error = new AppError('Bad request', 400);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);

      process.env.NODE_ENV = originalEnv;
    });

    it('should send full error details in development', () => {
      const error = new AppError('Test error', 400);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'fail',
          message: 'Test error',
          error: expect.any(Object),
          stack: expect.any(String),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should send limited error details in production for operational errors', () => {
      const error = new AppError('User-friendly message', 400);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'fail',
        message: 'User-friendly message',
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error details in production for non-operational errors', () => {
      const error = new Error('Internal error details');
      error.statusCode = 500;

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong!',
      });

      process.env.NODE_ENV = originalEnv;
    });
  });
});

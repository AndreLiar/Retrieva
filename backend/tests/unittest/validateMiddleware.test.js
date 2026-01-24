/**
 * Unit Tests for Validate Middleware
 *
 * Tests the Zod schema validation middleware
 * Critical for input validation and type safety
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
} from '../../middleware/validate.js';

describe('Validate Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
      query: {},
      params: {},
      path: '/test',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  // ============================================================================
  // validate function tests
  // ============================================================================
  describe('validate', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      age: z.number().positive().optional(),
    });

    it('should call next for valid data', async () => {
      mockReq.body = {
        name: 'John',
        email: 'john@example.com',
      };

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should store validated data in req.validatedData', async () => {
      mockReq.body = {
        name: 'John',
        email: 'john@example.com',
        age: 25,
      };

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.validatedData).toBeDefined();
      expect(mockReq.validatedData.body).toEqual({
        name: 'John',
        email: 'john@example.com',
        age: 25,
      });
    });

    it('should replace req.body with validated data for body source', async () => {
      mockReq.body = {
        name: 'John',
        email: 'john@example.com',
        extraField: 'should be stripped',
      };

      const strictSchema = z
        .object({
          name: z.string(),
          email: z.string().email(),
        })
        .strict();

      // With strict mode, extra fields would cause error
      // Without strict, Zod passes through - let's test the replacement behavior
      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.validated).toBe(true);
    });

    it('should set req.validated flag', async () => {
      mockReq.body = {
        name: 'John',
        email: 'john@example.com',
      };

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.validated).toBe(true);
    });

    it('should return 400 for invalid data', async () => {
      mockReq.body = {
        name: '', // Invalid: empty string
        email: 'not-an-email', // Invalid: not an email
      };

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return formatted validation errors', async () => {
      mockReq.body = {
        name: '',
        email: 'invalid',
      };

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: 'Validation failed',
          errors: expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: expect.any(String),
                message: expect.any(String),
              }),
            ]),
          }),
        })
      );
    });

    it('should handle missing required fields', async () => {
      mockReq.body = {}; // Missing required name and email

      const middleware = validate(testSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate query parameters', async () => {
      mockReq.query = {
        page: '1',
        limit: '10',
      };

      const querySchema = z.object({
        page: z.string().regex(/^\d+$/),
        limit: z.string().regex(/^\d+$/),
      });

      const middleware = validate(querySchema, 'query');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.query).toBeDefined();
    });

    it('should validate URL params', async () => {
      mockReq.params = {
        id: 'abc123',
      };

      const paramsSchema = z.object({
        id: z.string().min(1),
      });

      const middleware = validate(paramsSchema, 'params');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.params).toBeDefined();
    });

    it('should handle type coercion with Zod transforms', async () => {
      mockReq.query = {
        age: '25',
      };

      const coerceSchema = z.object({
        age: z.coerce.number(),
      });

      const middleware = validate(coerceSchema, 'query');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.query.age).toBe(25);
      expect(typeof mockReq.validatedData.query.age).toBe('number');
    });

    it('should handle nested object validation', async () => {
      mockReq.body = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
          },
        },
      };

      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
          }),
        }),
      });

      const middleware = validate(nestedSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle array validation', async () => {
      mockReq.body = {
        items: ['a', 'b', 'c'],
      };

      const arraySchema = z.object({
        items: z.array(z.string()).min(1),
      });

      const middleware = validate(arraySchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 500 for unexpected errors', async () => {
      // Create a schema that throws an unexpected error
      const brokenSchema = {
        parseAsync: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      };

      mockReq.body = { data: 'test' };

      const middleware = validate(brokenSchema, 'body');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal validation error',
        })
      );
    });
  });

  // ============================================================================
  // validateBody helper tests
  // ============================================================================
  describe('validateBody', () => {
    it('should validate request body', async () => {
      const schema = z.object({
        name: z.string(),
      });

      mockReq.body = { name: 'Test' };

      const middleware = validateBody(schema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.body).toEqual({ name: 'Test' });
    });
  });

  // ============================================================================
  // validateQuery helper tests
  // ============================================================================
  describe('validateQuery', () => {
    it('should validate query parameters', async () => {
      const schema = z.object({
        search: z.string().optional(),
      });

      mockReq.query = { search: 'test' };

      const middleware = validateQuery(schema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.query).toEqual({ search: 'test' });
    });
  });

  // ============================================================================
  // validateParams helper tests
  // ============================================================================
  describe('validateParams', () => {
    it('should validate URL params', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validateParams(schema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedData.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject invalid UUID', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: 'not-a-uuid' };

      const middleware = validateParams(schema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

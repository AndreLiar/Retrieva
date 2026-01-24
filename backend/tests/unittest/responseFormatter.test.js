/**
 * Unit Tests for Response Formatter
 *
 * Tests the response formatting utilities for success, error,
 * and paginated responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  sendSuccess,
  sendError,
  sendPaginatedResponse,
} from '../../utils/core/responseFormatter.js';

describe('Response Formatter', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  // ============================================================================
  // sendSuccess tests
  // ============================================================================
  describe('sendSuccess', () => {
    it('should send success response with correct status code', () => {
      sendSuccess(mockRes, 200, 'Success');

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should send response with status "success"', () => {
      sendSuccess(mockRes, 200, 'Success');

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
        })
      );
    });

    it('should include message in response', () => {
      sendSuccess(mockRes, 200, 'Operation completed');

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Operation completed',
        })
      );
    });

    it('should include data when provided', () => {
      const data = { id: 1, name: 'Test' };
      sendSuccess(mockRes, 200, 'Success', data);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
        data: { id: 1, name: 'Test' },
      });
    });

    it('should not include data property when data is null', () => {
      sendSuccess(mockRes, 200, 'Success', null);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Success',
      });
    });

    it('should not include data property when data is not provided', () => {
      sendSuccess(mockRes, 200, 'Success');

      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall).not.toHaveProperty('data');
    });

    it('should work with 201 status for creation', () => {
      sendSuccess(mockRes, 201, 'Created', { id: 123 });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Created',
        data: { id: 123 },
      });
    });

    it('should handle array data', () => {
      const data = [{ id: 1 }, { id: 2 }];
      sendSuccess(mockRes, 200, 'List retrieved', data);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'List retrieved',
        data: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  // ============================================================================
  // sendError tests
  // ============================================================================
  describe('sendError', () => {
    it('should send error response with correct status code', () => {
      sendError(mockRes, 400, 'Bad request');

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should send response with status "error"', () => {
      sendError(mockRes, 400, 'Bad request');

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
        })
      );
    });

    it('should include message in response', () => {
      sendError(mockRes, 400, 'Validation failed');

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed',
        })
      );
    });

    it('should include errors when provided', () => {
      const errors = { email: 'Invalid email format' };
      sendError(mockRes, 400, 'Validation failed', errors);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        errors: { email: 'Invalid email format' },
      });
    });

    it('should not include errors property when errors is null', () => {
      sendError(mockRes, 400, 'Bad request', null);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Bad request',
      });
    });

    it('should not include errors property when errors is not provided', () => {
      sendError(mockRes, 400, 'Bad request');

      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall).not.toHaveProperty('errors');
    });

    it('should work with 401 status for unauthorized', () => {
      sendError(mockRes, 401, 'Authentication required');

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should work with 403 status for forbidden', () => {
      sendError(mockRes, 403, 'Access denied');

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should work with 404 status for not found', () => {
      sendError(mockRes, 404, 'Resource not found');

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should work with 500 status for server errors', () => {
      sendError(mockRes, 500, 'Internal server error');

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle array of errors', () => {
      const errors = ['Field1 is required', 'Field2 is invalid'];
      sendError(mockRes, 400, 'Multiple errors', errors);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Multiple errors',
        errors: ['Field1 is required', 'Field2 is invalid'],
      });
    });
  });

  // ============================================================================
  // sendPaginatedResponse tests
  // ============================================================================
  describe('sendPaginatedResponse', () => {
    it('should always send 200 status', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 0);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should include status success', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 0);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
        })
      );
    });

    it('should include data array', () => {
      const data = [{ id: 1 }, { id: 2 }];
      sendPaginatedResponse(mockRes, data, 1, 10, 2);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ id: 1 }, { id: 2 }],
        })
      );
    });

    it('should calculate correct total pages', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            totalPages: 3,
          }),
        })
      );
    });

    it('should handle exact page count', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 20);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            totalPages: 2,
          }),
        })
      );
    });

    it('should include current page', () => {
      sendPaginatedResponse(mockRes, [], 2, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            currentPage: 2,
          }),
        })
      );
    });

    it('should include items per page', () => {
      sendPaginatedResponse(mockRes, [], 1, 15, 45);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            itemsPerPage: 15,
          }),
        })
      );
    });

    it('should include total items', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 42);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            totalItems: 42,
          }),
        })
      );
    });

    it('should set hasNextPage to true when more pages exist', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasNextPage: true,
          }),
        })
      );
    });

    it('should set hasNextPage to false on last page', () => {
      sendPaginatedResponse(mockRes, [], 3, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasNextPage: false,
          }),
        })
      );
    });

    it('should set hasPrevPage to false on first page', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasPrevPage: false,
          }),
        })
      );
    });

    it('should set hasPrevPage to true on page > 1', () => {
      sendPaginatedResponse(mockRes, [], 2, 10, 25);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasPrevPage: true,
          }),
        })
      );
    });

    it('should handle empty results', () => {
      sendPaginatedResponse(mockRes, [], 1, 10, 0);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        data: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          itemsPerPage: 10,
          totalItems: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    });

    it('should handle single item that fits on one page', () => {
      sendPaginatedResponse(mockRes, [{ id: 1 }], 1, 10, 1);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        data: [{ id: 1 }],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          itemsPerPage: 10,
          totalItems: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    });
  });
});

/**
 * Request Helpers Unit Tests
 *
 * Tests for request handling utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getUserId,
  isAuthenticated,
  parsePagination,
  parsePagePagination,
  buildPaginationMeta,
  parseSort,
  verifyOwnership,
} from '../../utils/core/requestHelpers.js';

describe('Request Helpers', () => {
  describe('getUserId', () => {
    it('should return userId from req.user', () => {
      const req = { user: { userId: 'user-123' } };

      expect(getUserId(req)).toBe('user-123');
    });

    it('should return fallback when no user', () => {
      const req = {};

      expect(getUserId(req)).toBe('anonymous');
    });

    it('should return custom fallback', () => {
      const req = {};

      expect(getUserId(req, 'guest')).toBe('guest');
    });

    it('should return fallback when userId is undefined', () => {
      const req = { user: {} };

      expect(getUserId(req)).toBe('anonymous');
    });

    it('should handle null user', () => {
      const req = { user: null };

      expect(getUserId(req)).toBe('anonymous');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when userId exists', () => {
      const req = { user: { userId: 'user-123' } };

      expect(isAuthenticated(req)).toBe(true);
    });

    it('should return false when no user', () => {
      const req = {};

      expect(isAuthenticated(req)).toBe(false);
    });

    it('should return false when userId is undefined', () => {
      const req = { user: {} };

      expect(isAuthenticated(req)).toBe(false);
    });

    it('should return false when user is null', () => {
      const req = { user: null };

      expect(isAuthenticated(req)).toBe(false);
    });
  });

  describe('parsePagination', () => {
    it('should return defaults when no query params', () => {
      const query = {};
      const result = parsePagination(query);

      expect(result).toEqual({
        limit: 50,
        skip: 0,
        page: 1,
      });
    });

    it('should parse valid limit and skip', () => {
      const query = { limit: '25', skip: '10' };
      const result = parsePagination(query);

      expect(result).toEqual({
        limit: 25,
        skip: 10,
        page: 1,
      });
    });

    it('should respect custom defaults', () => {
      const query = {};
      const result = parsePagination(query, { defaultLimit: 20, defaultSkip: 5 });

      expect(result.limit).toBe(20);
      expect(result.skip).toBe(5);
    });

    it('should enforce maxLimit', () => {
      const query = { limit: '500' };
      const result = parsePagination(query, { maxLimit: 100 });

      expect(result.limit).toBe(100);
    });

    it('should clamp limit 0 to minimum of 1', () => {
      const query = { limit: '0' };
      const result = parsePagination(query);

      // 0 is a valid integer but gets clamped to minimum of 1
      expect(result.limit).toBe(1);
    });

    it('should enforce minimum skip of 0', () => {
      const query = { skip: '-10' };
      const result = parsePagination(query);

      expect(result.skip).toBe(0);
    });

    it('should handle negative limit', () => {
      const query = { limit: '-5' };
      const result = parsePagination(query);

      expect(result.limit).toBe(1);
    });

    it('should handle non-numeric strings', () => {
      const query = { limit: 'abc', skip: 'xyz' };
      const result = parsePagination(query);

      expect(result.limit).toBe(50); // fallback to default
      expect(result.skip).toBe(0);
    });

    it('should parse page parameter', () => {
      const query = { page: '3' };
      const result = parsePagination(query);

      expect(result.page).toBe(3);
    });
  });

  describe('parsePagePagination', () => {
    it('should calculate skip from page', () => {
      const query = { page: '2', limit: '10' };
      const result = parsePagePagination(query);

      expect(result).toEqual({
        limit: 10,
        skip: 10, // (2-1) * 10
        page: 2,
      });
    });

    it('should use defaults', () => {
      const query = {};
      const result = parsePagePagination(query);

      expect(result).toEqual({
        limit: 20,
        skip: 0,
        page: 1,
      });
    });

    it('should calculate correct skip for higher pages', () => {
      const query = { page: '5', limit: '20' };
      const result = parsePagePagination(query);

      expect(result.skip).toBe(80); // (5-1) * 20
    });

    it('should enforce minimum page of 1', () => {
      const query = { page: '0' };
      const result = parsePagePagination(query);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it('should enforce maxLimit', () => {
      const query = { limit: '100' };
      const result = parsePagePagination(query, { maxLimit: 50 });

      expect(result.limit).toBe(50);
    });
  });

  describe('buildPaginationMeta', () => {
    it('should build correct metadata', () => {
      const result = buildPaginationMeta(100, 20, 0);

      expect(result).toEqual({
        total: 100,
        limit: 20,
        skip: 0,
        page: 1,
        totalPages: 5,
        hasMore: true,
        hasPrevious: false,
      });
    });

    it('should calculate correct page from skip', () => {
      const result = buildPaginationMeta(100, 20, 40);

      expect(result.page).toBe(3); // 40/20 + 1 = 3
    });

    it('should detect hasMore correctly', () => {
      const hasMore = buildPaginationMeta(100, 20, 80);
      const _noMore = buildPaginationMeta(100, 20, 80);

      expect(hasMore.hasMore).toBe(false); // 80 + 20 = 100 (not < 100)
    });

    it('should detect hasPrevious correctly', () => {
      const noPrevious = buildPaginationMeta(100, 20, 0);
      const hasPrevious = buildPaginationMeta(100, 20, 20);

      expect(noPrevious.hasPrevious).toBe(false);
      expect(hasPrevious.hasPrevious).toBe(true);
    });

    it('should handle zero total', () => {
      const result = buildPaginationMeta(0, 20, 0);

      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle single page', () => {
      const result = buildPaginationMeta(10, 20, 0);

      expect(result.totalPages).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('parseSort', () => {
    it('should parse descending sort', () => {
      const result = parseSort('-createdAt');

      expect(result).toEqual({ createdAt: -1 });
    });

    it('should parse ascending sort', () => {
      const result = parseSort('name');

      expect(result).toEqual({ name: 1 });
    });

    it('should use default when no sort provided', () => {
      const result = parseSort(null, [], '-updatedAt');

      expect(result).toEqual({ updatedAt: -1 });
    });

    it('should validate against allowed fields', () => {
      const result = parseSort('hackedField', ['name', 'createdAt']);

      expect(result).toEqual({ createdAt: -1 }); // fallback to default
    });

    it('should allow valid fields', () => {
      const result = parseSort('name', ['name', 'createdAt']);

      expect(result).toEqual({ name: 1 });
    });

    it('should handle empty allowed fields (all allowed)', () => {
      const result = parseSort('anyField', []);

      expect(result).toEqual({ anyField: 1 });
    });
  });

  describe('verifyOwnership', () => {
    it('should return true for matching string IDs', () => {
      expect(verifyOwnership('user-123', 'user-123')).toBe(true);
    });

    it('should return false for different IDs', () => {
      expect(verifyOwnership('user-123', 'user-456')).toBe(false);
    });

    it('should handle ObjectId-like objects with toString', () => {
      const objectId = { toString: () => 'user-123' };

      expect(verifyOwnership(objectId, 'user-123')).toBe(true);
    });

    it('should handle both as ObjectId-like objects', () => {
      const ownerId = { toString: () => 'user-123' };
      const userId = { toString: () => 'user-123' };

      expect(verifyOwnership(ownerId, userId)).toBe(true);
    });

    it('should return false for null ownerId', () => {
      expect(verifyOwnership(null, 'user-123')).toBe(false);
    });

    it('should return false for undefined userId', () => {
      expect(verifyOwnership('user-123', undefined)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(verifyOwnership('', '')).toBe(true);
      expect(verifyOwnership('user-123', '')).toBe(false);
    });
  });
});

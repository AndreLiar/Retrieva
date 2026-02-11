/**
 * Unit Tests for RAG Cache
 *
 * Tests the RAG response caching functionality that caches
 * answers to frequently asked questions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mock client is available when vi.mock runs
const mockRedisClient = vi.hoisted(() => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
}));

// Mock dependencies before importing
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../config/redis.js', () => ({
  redisConnection: mockRedisClient,
}));

// Import after mocking
import { ragCache } from '../../utils/rag/ragCache.js';

// Test workspace ID for tenant isolation
const TEST_WORKSPACE_ID = 'test-workspace-123';

describe('RAG Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // getCacheKey tests
  // ============================================================================
  describe('getCacheKey', () => {
    it('should generate consistent key for same question', () => {
      const key1 = ragCache.getCacheKey('What is RAG?', TEST_WORKSPACE_ID);
      const key2 = ragCache.getCacheKey('What is RAG?', TEST_WORKSPACE_ID);
      expect(key1).toBe(key2);
    });

    it('should normalize question to lowercase', () => {
      const key1 = ragCache.getCacheKey('What is RAG?', TEST_WORKSPACE_ID);
      const key2 = ragCache.getCacheKey('WHAT IS RAG?', TEST_WORKSPACE_ID);
      expect(key1).toBe(key2);
    });

    it('should trim whitespace', () => {
      const key1 = ragCache.getCacheKey('What is RAG?', TEST_WORKSPACE_ID);
      const key2 = ragCache.getCacheKey('  What is RAG?  ', TEST_WORKSPACE_ID);
      expect(key1).toBe(key2);
    });

    it('should include workspace ID in key for tenant isolation', () => {
      const key = ragCache.getCacheKey('Question', TEST_WORKSPACE_ID);
      expect(key).toContain(`rag:ws:${TEST_WORKSPACE_ID}:`);
    });

    it('should include conversation ID when provided', () => {
      const key1 = ragCache.getCacheKey('Question', TEST_WORKSPACE_ID, 'conv-123');
      expect(key1).toContain('conv:conv-123');
    });

    it('should not include conversation ID when not provided', () => {
      const key = ragCache.getCacheKey('Question', TEST_WORKSPACE_ID);
      expect(key).not.toContain('conv:');
      expect(key).toMatch(/^rag:ws:/);
    });

    it('should generate different keys for different questions', () => {
      const key1 = ragCache.getCacheKey('What is RAG?', TEST_WORKSPACE_ID);
      const key2 = ragCache.getCacheKey('How does RAG work?', TEST_WORKSPACE_ID);
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different workspaces', () => {
      const key1 = ragCache.getCacheKey('What is RAG?', 'workspace-1');
      const key2 = ragCache.getCacheKey('What is RAG?', 'workspace-2');
      expect(key1).not.toBe(key2);
    });

    it('should throw error when workspaceId is not provided', () => {
      expect(() => ragCache.getCacheKey('Question')).toThrow(
        'workspaceId is required for cache key generation'
      );
    });
  });

  // ============================================================================
  // getQuestionHash tests
  // ============================================================================
  describe('getQuestionHash', () => {
    it('should generate consistent hash for same question', () => {
      const hash1 = ragCache.getQuestionHash('Test question');
      const hash2 = ragCache.getQuestionHash('Test question');
      expect(hash1).toBe(hash2);
    });

    it('should normalize question before hashing', () => {
      const hash1 = ragCache.getQuestionHash('Test Question');
      const hash2 = ragCache.getQuestionHash('TEST QUESTION');
      expect(hash1).toBe(hash2);
    });

    it('should return 16 character hash', () => {
      const hash = ragCache.getQuestionHash('Any question');
      expect(hash).toHaveLength(16);
    });
  });

  // ============================================================================
  // get tests
  // ============================================================================
  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      ragCache.enabled = false;

      const result = await ragCache.get('Test question', TEST_WORKSPACE_ID);

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      ragCache.enabled = true;
    });

    it('should return null when cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await ragCache.get('Test question', TEST_WORKSPACE_ID);

      expect(result).toBeNull();
    });

    it('should return cached answer on cache hit', async () => {
      const cachedData = {
        answer: 'Cached answer',
        cachedAt: '2024-01-01T00:00:00Z',
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await ragCache.get('Test question', TEST_WORKSPACE_ID);

      expect(result.answer).toBe('Cached answer');
      expect(result.metadata.cacheHit).toBe(true);
    });

    it('should return null on Redis error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await ragCache.get('Test question', TEST_WORKSPACE_ID);

      expect(result).toBeNull();
    });

    it('should use workspace ID in cache key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await ragCache.get('Question', TEST_WORKSPACE_ID);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`rag:ws:${TEST_WORKSPACE_ID}:`)
      );
    });

    it('should use conversation ID in cache key when provided', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await ragCache.get('Question', TEST_WORKSPACE_ID, 'conv-123');

      expect(mockRedisClient.get).toHaveBeenCalledWith(expect.stringContaining('conv:conv-123'));
    });

    it('should return null when workspaceId is not provided', async () => {
      const result = await ragCache.get('Question', null);
      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // set tests
  // ============================================================================
  describe('set', () => {
    it('should not cache when disabled', async () => {
      ragCache.enabled = false;

      await ragCache.set('Question', { answer: 'Answer' }, TEST_WORKSPACE_ID);

      expect(mockRedisClient.setex).not.toHaveBeenCalled();

      ragCache.enabled = true;
    });

    it('should cache answer with TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await ragCache.set('Question', { answer: 'Answer' }, TEST_WORKSPACE_ID);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^rag:ws:/),
        ragCache.ttl,
        expect.stringContaining('Answer')
      );
    });

    it('should add cachedAt timestamp', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await ragCache.set('Question', { answer: 'Answer' }, TEST_WORKSPACE_ID);

      const setexCall = mockRedisClient.setex.mock.calls[0];
      const cachedValue = JSON.parse(setexCall[2]);
      expect(cachedValue.cachedAt).toBeDefined();
    });

    it('should handle Redis error gracefully', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(
        ragCache.set('Question', { answer: 'Answer' }, TEST_WORKSPACE_ID)
      ).resolves.toBeUndefined();
    });

    it('should include workspace and conversation ID in key when provided', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      await ragCache.set('Question', { answer: 'Answer' }, TEST_WORKSPACE_ID, 'conv-123');

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.stringContaining(`rag:ws:${TEST_WORKSPACE_ID}:conv:conv-123`),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should skip caching when workspaceId is not provided', async () => {
      await ragCache.set('Question', { answer: 'Answer' }, null);
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // invalidate tests
  // ============================================================================
  describe('invalidate', () => {
    it('should not delete when disabled', async () => {
      ragCache.enabled = false;

      await ragCache.invalidate('Question', TEST_WORKSPACE_ID);

      expect(mockRedisClient.del).not.toHaveBeenCalled();

      ragCache.enabled = true;
    });

    it('should delete cached entry', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await ragCache.invalidate('Question', TEST_WORKSPACE_ID);

      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should handle Redis error gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(ragCache.invalidate('Question', TEST_WORKSPACE_ID)).resolves.toBeUndefined();
    });

    it('should skip invalidation when workspaceId is not provided', async () => {
      await ragCache.invalidate('Question', null);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // clearByWorkspace tests
  // ============================================================================
  describe('clearByWorkspace', () => {
    it('should not clear when disabled', async () => {
      ragCache.enabled = false;

      await ragCache.clearByWorkspace(TEST_WORKSPACE_ID);

      expect(mockRedisClient.keys).not.toHaveBeenCalled();

      ragCache.enabled = true;
    });

    it('should delete all cache keys for a specific workspace', async () => {
      mockRedisClient.keys.mockResolvedValue([
        `rag:ws:${TEST_WORKSPACE_ID}:key1`,
        `rag:ws:${TEST_WORKSPACE_ID}:key2`,
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      await ragCache.clearByWorkspace(TEST_WORKSPACE_ID);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(`rag:ws:${TEST_WORKSPACE_ID}:*`);
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should skip when workspaceId is not provided', async () => {
      await ragCache.clearByWorkspace(null);
      expect(mockRedisClient.keys).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // clearAll tests
  // ============================================================================
  describe('clearAll', () => {
    it('should not clear when disabled', async () => {
      ragCache.enabled = false;

      await ragCache.clearAll();

      expect(mockRedisClient.keys).not.toHaveBeenCalled();

      ragCache.enabled = true;
    });

    it('should delete all RAG cache keys', async () => {
      mockRedisClient.keys.mockResolvedValue(['rag:key1', 'rag:key2']);
      mockRedisClient.del.mockResolvedValue(2);

      await ragCache.clearAll();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('rag:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['rag:key1', 'rag:key2']);
    });

    it('should not call del when no keys found', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await ragCache.clearAll();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle Redis error gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(ragCache.clearAll()).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // getStats tests
  // ============================================================================
  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.keys.mockResolvedValue(['rag:key1', 'rag:key2', 'rag:key3']);

      const stats = await ragCache.getStats();

      expect(stats.totalCached).toBe(3);
      expect(stats.enabled).toBe(true);
      expect(stats.ttl).toBe(ragCache.ttl);
    });

    it('should return zero count when no keys', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const stats = await ragCache.getStats();

      expect(stats.totalCached).toBe(0);
    });

    it('should return error stats on Redis error', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

      const stats = await ragCache.getStats();

      expect(stats.totalCached).toBe(0);
      expect(stats.error).toBe('Redis error');
    });
  });
});

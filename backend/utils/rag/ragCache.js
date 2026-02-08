import { createHash } from 'crypto';
import logger from '../../config/logger.js';
import { redisConnection as redisClient } from '../../config/redis.js';

/**
 * RAG Response Cache
 * Caches answers to frequently asked questions for faster response times
 */
class RAGCache {
  constructor() {
    this.ttl = parseInt(process.env.RAG_CACHE_TTL) || 3600; // 1 hour default
    this.enabled = process.env.RAG_CACHE_ENABLED !== 'false';
  }

  /**
   * Generate cache key from question
   * SECURITY: workspaceId is REQUIRED for tenant isolation
   * @param {string} question - User question
   * @param {string} workspaceId - Workspace ID (required for tenant isolation)
   * @param {string} conversationId - Optional conversation ID
   * @returns {string} Cache key
   */
  getCacheKey(question, workspaceId, conversationId = null) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for cache key generation (tenant isolation)');
    }
    const normalized = question.toLowerCase().trim();
    const hash = createHash('sha256').update(normalized).digest('hex');
    // Include workspaceId in key to ensure tenant isolation
    return conversationId
      ? `rag:ws:${workspaceId}:conv:${conversationId}:${hash.substring(0, 16)}`
      : `rag:ws:${workspaceId}:${hash.substring(0, 16)}`;
  }

  /**
   * Get question hash for analytics
   * @param {string} question - User question
   * @returns {string} Question hash
   */
  getQuestionHash(question) {
    const normalized = question.toLowerCase().trim();
    return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Get cached answer
   * @param {string} question - User question
   * @param {string} workspaceId - Workspace ID (required for tenant isolation)
   * @param {string} conversationId - Optional conversation ID
   * @returns {Promise<Object|null>} Cached answer or null
   */
  async get(question, workspaceId, conversationId = null) {
    if (!this.enabled) return null;
    if (!workspaceId) {
      logger.warn('Cache get called without workspaceId, skipping for tenant isolation', {
        service: 'rag-cache',
      });
      return null;
    }

    try {
      const key = this.getCacheKey(question, workspaceId, conversationId);
      const cached = await redisClient.get(key);

      if (cached) {
        logger.info('Cache HIT', {
          service: 'rag-cache',
          question: question.substring(0, 50) + '...',
          workspaceId,
          conversationId,
        });

        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          metadata: {
            ...parsed.metadata,
            cacheHit: true,
            cachedAt: parsed.cachedAt,
          },
        };
      }

      logger.debug('Cache MISS', {
        service: 'rag-cache',
        question: question.substring(0, 50) + '...',
      });

      return null;
    } catch (error) {
      logger.error('Cache retrieval error', {
        service: 'rag-cache',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Cache answer
   * @param {string} question - User question
   * @param {Object} answer - Answer object to cache
   * @param {string} workspaceId - Workspace ID (required for tenant isolation)
   * @param {string} conversationId - Optional conversation ID
   */
  async set(question, answer, workspaceId, conversationId = null) {
    if (!this.enabled) return;
    if (!workspaceId) {
      logger.warn('Cache set called without workspaceId, skipping for tenant isolation', {
        service: 'rag-cache',
      });
      return;
    }

    try {
      const key = this.getCacheKey(question, workspaceId, conversationId);
      const value = JSON.stringify({
        ...answer,
        cachedAt: new Date().toISOString(),
      });

      await redisClient.setex(key, this.ttl, value);

      logger.debug('Answer cached', {
        service: 'rag-cache',
        question: question.substring(0, 50) + '...',
        ttl: this.ttl,
        workspaceId,
        conversationId,
      });
    } catch (error) {
      logger.error('Cache storage error', {
        service: 'rag-cache',
        error: error.message,
      });
    }
  }

  /**
   * Invalidate cache for a question
   * @param {string} question - User question
   * @param {string} workspaceId - Workspace ID (required for tenant isolation)
   * @param {string} conversationId - Optional conversation ID
   */
  async invalidate(question, workspaceId, conversationId = null) {
    if (!this.enabled) return;
    if (!workspaceId) {
      logger.warn('Cache invalidate called without workspaceId, skipping for tenant isolation', {
        service: 'rag-cache',
      });
      return;
    }

    try {
      const key = this.getCacheKey(question, workspaceId, conversationId);
      await redisClient.del(key);

      logger.info('Cache invalidated', {
        service: 'rag-cache',
        question: question.substring(0, 50) + '...',
        workspaceId,
      });
    } catch (error) {
      logger.error('Cache invalidation error', {
        service: 'rag-cache',
        error: error.message,
      });
    }
  }

  /**
   * Clear all RAG cache
   */
  async clearAll() {
    if (!this.enabled) return;

    try {
      const keys = await redisClient.keys('rag:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.info(`Cleared ${keys.length} cached answers`, {
          service: 'rag-cache',
        });
      }
    } catch (error) {
      logger.error('Cache clear error', {
        service: 'rag-cache',
        error: error.message,
      });
    }
  }

  /**
   * Clear cache for a specific workspace (tenant-safe)
   * @param {string} workspaceId - Workspace ID
   */
  async clearByWorkspace(workspaceId) {
    if (!this.enabled) return;
    if (!workspaceId) {
      logger.warn('clearByWorkspace called without workspaceId', {
        service: 'rag-cache',
      });
      return;
    }

    try {
      const keys = await redisClient.keys(`rag:ws:${workspaceId}:*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.info(`Cleared ${keys.length} cached answers for workspace`, {
          service: 'rag-cache',
          workspaceId,
        });
      }
    } catch (error) {
      logger.error('Workspace cache clear error', {
        service: 'rag-cache',
        workspaceId,
        error: error.message,
      });
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    try {
      const keys = await redisClient.keys('rag:*');
      return {
        totalCached: keys.length,
        enabled: this.enabled,
        ttl: this.ttl,
      };
    } catch (error) {
      logger.error('Cache stats error', {
        service: 'rag-cache',
        error: error.message,
      });
      return {
        totalCached: 0,
        enabled: this.enabled,
        ttl: this.ttl,
        error: error.message,
      };
    }
  }
}

export const ragCache = new RAGCache();

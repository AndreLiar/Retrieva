/**
 * Memory Monitoring Service
 *
 * Provides comprehensive monitoring and metrics for the memory system:
 * - Cache hit/miss rates
 * - Memory usage statistics
 * - Entity memory performance
 * - Decay process tracking
 * - Real-time dashboards via WebSocket
 *
 * @module services/memory/memoryMonitor
 */

import { redisConnection } from '../../config/redis.js';
import { Message } from '../../models/Message.js';
import { Conversation } from '../../models/Conversation.js';
import { ConversationSummary } from '../../models/ConversationSummary.js';
import { Entity } from '../../models/Entity.js';
import { emitToUser, broadcast } from '../socketService.js';
import logger from '../../config/logger.js';

// Redis key prefixes for metrics
const METRICS_KEYS = {
  CACHE_HITS: 'metrics:cache:hits',
  CACHE_MISSES: 'metrics:cache:misses',
  MEMORY_BUILDS: 'metrics:memory:builds',
  MEMORY_BUILD_TIME: 'metrics:memory:buildTime',
  DECAY_RUNS: 'metrics:decay:runs',
  DECAY_FAILURES: 'metrics:decay:failures',
  ENTITY_EXTRACTIONS: 'metrics:entity:extractions',
  SUMMARY_GENERATIONS: 'metrics:summary:generations',
  HOURLY_STATS: 'metrics:hourly:',
  DAILY_STATS: 'metrics:daily:',
};

// Metrics retention periods
const METRICS_RETENTION = {
  HOURLY: 24 * 60 * 60, // 24 hours
  DAILY: 30 * 24 * 60 * 60, // 30 days
  LIST_MAX: 1000, // Max items in metric lists
};

/**
 * Memory Monitor Service
 */
class MemoryMonitorService {
  constructor() {
    this.redis = redisConnection;
    this.broadcastInterval = null;
  }

  /**
   * Ensure Redis connection
   */
  async ensureConnection() {
    if (this.redis.status !== 'ready') {
      await new Promise((resolve) => {
        if (this.redis.status === 'ready') {
          resolve();
        } else {
          this.redis.once('ready', resolve);
        }
      });
    }
  }

  // =========================================================================
  // Cache Metrics
  // =========================================================================

  /**
   * Record a cache hit
   */
  async recordCacheHit(cacheType = 'rag') {
    try {
      await this.ensureConnection();
      await this.redis.hincrby(METRICS_KEYS.CACHE_HITS, cacheType, 1);
      await this.redis.hincrby(METRICS_KEYS.CACHE_HITS, 'total', 1);
      await this.incrementHourlyMetric('cacheHits');
    } catch (error) {
      logger.warn('Failed to record cache hit', { error: error.message });
    }
  }

  /**
   * Record a cache miss
   */
  async recordCacheMiss(cacheType = 'rag') {
    try {
      await this.ensureConnection();
      await this.redis.hincrby(METRICS_KEYS.CACHE_MISSES, cacheType, 1);
      await this.redis.hincrby(METRICS_KEYS.CACHE_MISSES, 'total', 1);
      await this.incrementHourlyMetric('cacheMisses');
    } catch (error) {
      logger.warn('Failed to record cache miss', { error: error.message });
    }
  }

  /**
   * Get cache hit rate
   */
  async getCacheHitRate(cacheType = 'total') {
    try {
      await this.ensureConnection();
      const hits = parseInt(await this.redis.hget(METRICS_KEYS.CACHE_HITS, cacheType)) || 0;
      const misses = parseInt(await this.redis.hget(METRICS_KEYS.CACHE_MISSES, cacheType)) || 0;
      const total = hits + misses;

      return {
        hits,
        misses,
        total,
        hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%',
        hitRateNumeric: total > 0 ? hits / total : 0,
      };
    } catch (error) {
      logger.error('Failed to get cache hit rate', { error: error.message });
      return { hits: 0, misses: 0, total: 0, hitRate: '0%', hitRateNumeric: 0 };
    }
  }

  // =========================================================================
  // Memory Build Metrics
  // =========================================================================

  /**
   * Record memory context build
   */
  async recordMemoryBuild(buildTimeMs, entitiesCount, summariesCount) {
    try {
      await this.ensureConnection();
      await this.redis.hincrby(METRICS_KEYS.MEMORY_BUILDS, 'count', 1);
      await this.redis.lpush(METRICS_KEYS.MEMORY_BUILD_TIME, buildTimeMs);
      await this.redis.ltrim(METRICS_KEYS.MEMORY_BUILD_TIME, 0, METRICS_RETENTION.LIST_MAX - 1);
      await this.incrementHourlyMetric('memoryBuilds');

      // Track entity/summary counts
      await this.redis.hincrby(METRICS_KEYS.MEMORY_BUILDS, 'totalEntities', entitiesCount);
      await this.redis.hincrby(METRICS_KEYS.MEMORY_BUILDS, 'totalSummaries', summariesCount);
    } catch (error) {
      logger.warn('Failed to record memory build', { error: error.message });
    }
  }

  /**
   * Get memory build statistics
   */
  async getMemoryBuildStats() {
    try {
      await this.ensureConnection();
      const stats = (await this.redis.hgetall(METRICS_KEYS.MEMORY_BUILDS)) || {};
      const buildTimes = await this.redis.lrange(METRICS_KEYS.MEMORY_BUILD_TIME, 0, 99);

      const times = buildTimes.map((t) => parseInt(t));
      const avgBuildTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const maxBuildTime = times.length > 0 ? Math.max(...times) : 0;
      const minBuildTime = times.length > 0 ? Math.min(...times) : 0;

      return {
        totalBuilds: parseInt(stats.count) || 0,
        totalEntities: parseInt(stats.totalEntities) || 0,
        totalSummaries: parseInt(stats.totalSummaries) || 0,
        avgBuildTimeMs: Math.round(avgBuildTime),
        maxBuildTimeMs: maxBuildTime,
        minBuildTimeMs: minBuildTime,
        recentSamples: times.length,
      };
    } catch (error) {
      logger.error('Failed to get memory build stats', { error: error.message });
      return {};
    }
  }

  // =========================================================================
  // Decay Process Metrics
  // =========================================================================

  /**
   * Record decay process run
   */
  async recordDecayRun(result) {
    try {
      await this.ensureConnection();
      const timestamp = new Date().toISOString();

      await this.redis.lpush(
        METRICS_KEYS.DECAY_RUNS,
        JSON.stringify({
          timestamp,
          ...result,
        })
      );
      await this.redis.ltrim(METRICS_KEYS.DECAY_RUNS, 0, 99); // Keep last 100 runs

      // Update totals
      await this.redis.hincrby('metrics:decay:totals', 'runs', 1);
      await this.redis.hincrby(
        'metrics:decay:totals',
        'conversationsArchived',
        result.conversationsArchived || 0
      );
      await this.redis.hincrby(
        'metrics:decay:totals',
        'messagesDeleted',
        result.messagesDeleted || 0
      );
      await this.redis.hincrby(
        'metrics:decay:totals',
        'entitiesDecayed',
        result.entitiesDecayed || 0
      );

      logger.info('Recorded decay run metrics', { service: 'memory-monitor', result });
    } catch (error) {
      logger.warn('Failed to record decay run', { error: error.message });
    }
  }

  /**
   * Record decay failure
   */
  async recordDecayFailure(failure) {
    try {
      await this.ensureConnection();
      await this.redis.lpush(
        METRICS_KEYS.DECAY_FAILURES,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          ...failure,
        })
      );
      await this.redis.ltrim(METRICS_KEYS.DECAY_FAILURES, 0, 49); // Keep last 50 failures
      await this.redis.hincrby('metrics:decay:totals', 'failures', 1);
    } catch (error) {
      logger.warn('Failed to record decay failure', { error: error.message });
    }
  }

  /**
   * Get decay statistics
   */
  async getDecayStats() {
    try {
      await this.ensureConnection();
      const runs = await this.redis.lrange(METRICS_KEYS.DECAY_RUNS, 0, 9);
      const totals = (await this.redis.hgetall('metrics:decay:totals')) || {};

      return {
        totals: {
          runs: parseInt(totals.runs) || 0,
          failures: parseInt(totals.failures) || 0,
          conversationsArchived: parseInt(totals.conversationsArchived) || 0,
          messagesDeleted: parseInt(totals.messagesDeleted) || 0,
          entitiesDecayed: parseInt(totals.entitiesDecayed) || 0,
        },
        recentRuns: runs.map((r) => JSON.parse(r)),
      };
    } catch (error) {
      logger.error('Failed to get decay stats', { error: error.message });
      return { totals: {}, recentRuns: [] };
    }
  }

  // =========================================================================
  // Database Metrics
  // =========================================================================

  /**
   * Get current database statistics
   */
  async getDatabaseStats() {
    try {
      const [
        conversationCount,
        messageCount,
        summaryCount,
        entityCount,
        recentConversations,
        recentMessages,
      ] = await Promise.all([
        Conversation.countDocuments(),
        Message.countDocuments(),
        ConversationSummary.countDocuments(),
        Entity.countDocuments(),
        Conversation.countDocuments({
          updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
        Message.countDocuments({
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
      ]);

      return {
        conversations: {
          total: conversationCount,
          last24h: recentConversations,
        },
        messages: {
          total: messageCount,
          last24h: recentMessages,
        },
        summaries: {
          total: summaryCount,
          coverageRate:
            conversationCount > 0
              ? ((summaryCount / conversationCount) * 100).toFixed(1) + '%'
              : '0%',
        },
        entities: {
          total: entityCount,
        },
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error: error.message });
      return {};
    }
  }

  // =========================================================================
  // Hourly/Daily Metrics
  // =========================================================================

  /**
   * Increment hourly metric
   */
  async incrementHourlyMetric(metric, value = 1) {
    try {
      const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const key = `${METRICS_KEYS.HOURLY_STATS}${hourKey}`;
      await this.redis.hincrby(key, metric, value);
      await this.redis.expire(key, METRICS_RETENTION.HOURLY);
    } catch {
      // Silent fail for metric increment
    }
  }

  /**
   * Get hourly metrics for the last N hours
   */
  async getHourlyMetrics(hours = 24) {
    try {
      await this.ensureConnection();
      const metrics = [];
      const now = new Date();

      for (let i = 0; i < hours; i++) {
        const hour = new Date(now - i * 60 * 60 * 1000);
        const hourKey = hour.toISOString().slice(0, 13);
        const key = `${METRICS_KEYS.HOURLY_STATS}${hourKey}`;
        const data = await this.redis.hgetall(key);

        metrics.push({
          hour: hourKey,
          cacheHits: parseInt(data?.cacheHits) || 0,
          cacheMisses: parseInt(data?.cacheMisses) || 0,
          memoryBuilds: parseInt(data?.memoryBuilds) || 0,
        });
      }

      return metrics.reverse();
    } catch (error) {
      logger.error('Failed to get hourly metrics', { error: error.message });
      return [];
    }
  }

  // =========================================================================
  // Comprehensive Dashboard
  // =========================================================================

  /**
   * Get comprehensive memory system dashboard
   */
  async getDashboard() {
    try {
      const [cacheStats, memoryBuildStats, decayStats, databaseStats, hourlyMetrics, redisInfo] =
        await Promise.all([
          this.getCacheHitRate(),
          this.getMemoryBuildStats(),
          this.getDecayStats(),
          this.getDatabaseStats(),
          this.getHourlyMetrics(24),
          this.getRedisMemoryUsage(),
        ]);

      return {
        timestamp: new Date().toISOString(),
        cache: cacheStats,
        memoryBuilds: memoryBuildStats,
        decay: decayStats,
        database: databaseStats,
        hourlyTrends: hourlyMetrics,
        redis: redisInfo,
        health: this.calculateHealthScore({
          cacheStats,
          memoryBuildStats,
          decayStats,
        }),
      };
    } catch (error) {
      logger.error('Failed to get dashboard', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Get Redis memory usage
   */
  async getRedisMemoryUsage() {
    try {
      await this.ensureConnection();
      const info = await this.redis.info('memory');
      const lines = info.split('\r\n');
      const memoryInfo = {};

      for (const line of lines) {
        const [key, value] = line.split(':');
        if (key && value) {
          memoryInfo[key] = value;
        }
      }

      return {
        usedMemory: memoryInfo.used_memory_human || 'unknown',
        usedMemoryPeak: memoryInfo.used_memory_peak_human || 'unknown',
        usedMemoryRss: memoryInfo.used_memory_rss_human || 'unknown',
        status: this.redis.status,
      };
    } catch (error) {
      return { status: this.redis.status, error: error.message };
    }
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore({ cacheStats, memoryBuildStats, decayStats }) {
    let score = 100;
    const issues = [];

    // Cache hit rate (should be > 30%)
    if (cacheStats.hitRateNumeric < 0.3 && cacheStats.total > 100) {
      score -= 20;
      issues.push('Low cache hit rate');
    }

    // Average build time (should be < 500ms)
    if (memoryBuildStats.avgBuildTimeMs > 500) {
      score -= 15;
      issues.push('High memory build latency');
    }

    // Recent decay failures
    if (decayStats.totals?.failures > 5) {
      score -= 10;
      issues.push('Multiple decay failures');
    }

    return {
      score: Math.max(0, score),
      status: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'unhealthy',
      issues,
    };
  }

  // =========================================================================
  // Real-time Broadcasting
  // =========================================================================

  /**
   * Start broadcasting metrics to subscribed users
   */
  startMetricsBroadcast(intervalMs = 30000) {
    if (this.broadcastInterval) {
      return;
    }

    this.broadcastInterval = setInterval(async () => {
      try {
        const dashboard = await this.getDashboard();
        broadcast('memory:metrics-update', dashboard);
      } catch (error) {
        logger.warn('Failed to broadcast metrics', { error: error.message });
      }
    }, intervalMs);

    logger.info('Memory metrics broadcast started', {
      service: 'memory-monitor',
      intervalMs,
    });
  }

  /**
   * Stop metrics broadcast
   */
  stopMetricsBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
      logger.info('Memory metrics broadcast stopped', {
        service: 'memory-monitor',
      });
    }
  }

  /**
   * Send metrics to specific user
   */
  async sendMetricsToUser(userId) {
    try {
      const dashboard = await this.getDashboard();
      emitToUser(userId, 'memory:metrics-update', dashboard);
    } catch (error) {
      logger.warn('Failed to send metrics to user', {
        userId,
        error: error.message,
      });
    }
  }

  // =========================================================================
  // Reset Metrics
  // =========================================================================

  /**
   * Reset all metrics (for maintenance)
   */
  async resetMetrics() {
    try {
      await this.ensureConnection();
      const keys = await this.redis.keys('metrics:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      logger.info('All memory metrics reset', {
        service: 'memory-monitor',
        keysDeleted: keys.length,
      });

      return { reset: true, keysDeleted: keys.length };
    } catch (error) {
      logger.error('Failed to reset metrics', { error: error.message });
      throw error;
    }
  }
}

// Singleton instance
export const memoryMonitor = new MemoryMonitorService();

export default memoryMonitor;

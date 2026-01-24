/**
 * Sync Cooldown Service
 *
 * SECURITY FIX (API6:2023): Per-workspace rate limiting for sync operations
 * Prevents abuse of Notion API quotas and protects against excessive sync costs.
 *
 * @module services/syncCooldownService
 */

import { redisConnection } from '../config/redis.js';
import logger from '../config/logger.js';

/**
 * Default cooldown period in seconds (5 minutes)
 * @type {number}
 */
const DEFAULT_COOLDOWN_SECONDS = 5 * 60;

/**
 * Redis key prefix for sync cooldowns
 * @type {string}
 */
const COOLDOWN_KEY_PREFIX = 'sync:cooldown:';

/**
 * Sync Cooldown Service
 * Manages per-workspace sync rate limiting using Redis
 */
class SyncCooldownService {
  constructor() {
    this.cooldownSeconds =
      parseInt(process.env.SYNC_COOLDOWN_SECONDS, 10) || DEFAULT_COOLDOWN_SECONDS;
  }

  /**
   * Get the Redis key for a workspace's sync cooldown
   * @param {string} workspaceId - Workspace ID
   * @returns {string} Redis key
   * @private
   */
  _getCooldownKey(workspaceId) {
    return `${COOLDOWN_KEY_PREFIX}${workspaceId}`;
  }

  /**
   * Check if a workspace is currently in cooldown period
   * @param {string} workspaceId - Workspace ID to check
   * @returns {Promise<{allowed: boolean, remainingSeconds?: number, lastSyncAt?: Date}>}
   */
  async checkCooldown(workspaceId) {
    try {
      const key = this._getCooldownKey(workspaceId);
      const lastSyncTimestamp = await redisConnection.get(key);

      if (!lastSyncTimestamp) {
        return { allowed: true };
      }

      const lastSyncAt = new Date(parseInt(lastSyncTimestamp, 10));
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastSyncAt.getTime()) / 1000);
      const remainingSeconds = this.cooldownSeconds - elapsedSeconds;

      if (remainingSeconds > 0) {
        logger.info('Sync cooldown active', {
          workspaceId,
          remainingSeconds,
          lastSyncAt: lastSyncAt.toISOString(),
        });

        return {
          allowed: false,
          remainingSeconds,
          lastSyncAt,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Error checking sync cooldown', {
        workspaceId,
        error: error.message,
      });
      // On error, allow the sync to proceed (fail-open for usability)
      return { allowed: true };
    }
  }

  /**
   * Record a sync operation, starting the cooldown period
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<void>}
   */
  async recordSync(workspaceId) {
    try {
      const key = this._getCooldownKey(workspaceId);
      const timestamp = Date.now();

      // Set the timestamp with TTL equal to cooldown period
      // This auto-expires the key, saving memory
      await redisConnection.setex(key, this.cooldownSeconds, timestamp.toString());

      logger.info('Sync cooldown started', {
        workspaceId,
        cooldownSeconds: this.cooldownSeconds,
      });
    } catch (error) {
      logger.error('Error recording sync cooldown', {
        workspaceId,
        error: error.message,
      });
      // Don't throw - cooldown tracking failure shouldn't block sync
    }
  }

  /**
   * Clear the cooldown for a workspace (admin override)
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<boolean>} True if cooldown was cleared
   */
  async clearCooldown(workspaceId) {
    try {
      const key = this._getCooldownKey(workspaceId);
      const result = await redisConnection.del(key);

      logger.info('Sync cooldown cleared', { workspaceId, cleared: result > 0 });

      return result > 0;
    } catch (error) {
      logger.error('Error clearing sync cooldown', {
        workspaceId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get the current cooldown configuration
   * @returns {{cooldownSeconds: number}}
   */
  getConfig() {
    return {
      cooldownSeconds: this.cooldownSeconds,
    };
  }
}

export const syncCooldownService = new SyncCooldownService();

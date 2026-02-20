/**
 * Memory Decay and Archival Service
 *
 * M4 WORKING MEMORY: Implements temporal decay and archival
 * - Decay weights for old memories
 * - Archive old conversations
 * - Compress and prune unused data
 * - Retention policies
 *
 * @module services/memory/memoryDecay
 */

import { Message } from '../../models/Message.js';
import { Conversation } from '../../models/Conversation.js';
import { ConversationSummary } from '../../models/ConversationSummary.js';
import { Entity } from '../../models/Entity.js';
import { summarizeConversation } from './conversationSummarization.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} DecayConfig
 * @property {number} conversationMaxAgeDays - Max age before archiving conversations
 * @property {number} messageRetentionDays - Days to keep individual messages
 * @property {number} entityDecayRate - Daily decay rate for entity importance
 * @property {number} summaryRetentionDays - Days to keep summaries
 */

/**
 * @typedef {Object} ArchiveStats
 * @property {number} conversationsArchived
 * @property {number} messagesDeleted
 * @property {number} summariesCreated
 * @property {number} entitiesDecayed
 */

/**
 * Default decay configuration
 */
const DEFAULT_CONFIG = {
  conversationMaxAgeDays: 90,
  messageRetentionDays: 30,
  entityDecayRate: 0.01, // 1% per day
  summaryRetentionDays: 365,
  minMessagesForSummary: 5,
  archiveBatchSize: 100,
};

/**
 * Memory Decay Manager
 */
class MemoryDecayManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full decay and archival process
   *
   * @param {Object} options - Process options
   * @returns {Promise<ArchiveStats>}
   */
  async runDecayProcess(options = {}) {
    const { dryRun = false, userId = null, workspaceId = null } = options;
    const startTime = Date.now();

    logger.info('Starting memory decay process', {
      service: 'memory-decay',
      dryRun,
      userId,
      workspaceId,
    });

    const stats = {
      conversationsArchived: 0,
      messagesDeleted: 0,
      summariesCreated: 0,
      entitiesDecayed: 0,
      spaceSaved: 0,
    };

    try {
      // 1. Archive old conversations (create summaries, delete messages)
      const archiveResult = await this.archiveOldConversations({
        dryRun,
        userId,
        workspaceId,
      });
      stats.conversationsArchived = archiveResult.archived;
      stats.summariesCreated = archiveResult.summariesCreated;
      stats.messagesDeleted = archiveResult.messagesDeleted;

      // 2. Apply entity decay
      const decayResult = await this.applyEntityDecay({
        dryRun,
        workspaceId,
      });
      stats.entitiesDecayed = decayResult.decayed;

      // 3. Prune orphaned data
      const pruneResult = await this.pruneOrphanedData({ dryRun });
      stats.spaceSaved = pruneResult.spaceSaved;

      logger.info('Memory decay process complete', {
        service: 'memory-decay',
        ...stats,
        processingTimeMs: Date.now() - startTime,
      });

      return stats;
    } catch (error) {
      logger.error('Memory decay process failed', {
        service: 'memory-decay',
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Archive old conversations
   * Creates summaries and optionally deletes old messages
   *
   * @param {Object} options - Archive options
   * @returns {Promise<Object>}
   */
  async archiveOldConversations(options = {}) {
    const { dryRun = false, userId = null, workspaceId = null } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.conversationMaxAgeDays);

    const query = {
      updatedAt: { $lt: cutoffDate },
      messageCount: { $gte: this.config.minMessagesForSummary },
    };
    if (userId) query.userId = userId;
    if (workspaceId) query.workspaceId = workspaceId;

    const conversations = await Conversation.find(query)
      .limit(this.config.archiveBatchSize)
      .select('_id userId workspaceId messageCount');

    const result = {
      archived: 0,
      summariesCreated: 0,
      messagesDeleted: 0,
    };

    for (const conv of conversations) {
      try {
        // Check if summary already exists
        const existingSummary = await ConversationSummary.findOne({
          conversationId: conv._id,
        });

        if (!existingSummary) {
          if (!dryRun) {
            // Create summary before archiving
            await summarizeConversation(conv._id.toString(), {
              forceNew: true,
              messageThreshold: this.config.minMessagesForSummary,
            });
            result.summariesCreated++;
          }
        }

        // Delete old messages (keep summary)
        const messageCutoff = new Date();
        messageCutoff.setDate(messageCutoff.getDate() - this.config.messageRetentionDays);

        if (!dryRun) {
          const deleteResult = await Message.deleteMany({
            conversationId: conv._id,
            timestamp: { $lt: messageCutoff },
          });
          result.messagesDeleted += deleteResult.deletedCount;
        }

        result.archived++;
      } catch (error) {
        logger.warn('Failed to archive conversation', {
          service: 'memory-decay',
          conversationId: conv._id,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * Apply decay to entity importance scores
   * Reduces relevance of entities that haven't been mentioned recently
   *
   * @param {Object} options - Decay options
   * @returns {Promise<Object>}
   */
  async applyEntityDecay(options = {}) {
    const { dryRun = false, workspaceId = null } = options;

    const query = workspaceId ? { workspaceId } : {};
    const now = new Date();

    const entities = await Entity.find(query).select('_id stats confidence updatedAt');

    let decayed = 0;

    for (const entity of entities) {
      // Calculate days since last update
      const daysSinceUpdate = (now - entity.updatedAt) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 7) {
        // Only decay if not updated in a week
        // Apply exponential decay
        const decayFactor = Math.pow(1 - this.config.entityDecayRate, daysSinceUpdate);
        const newConfidence = Math.max(0.1, entity.confidence * decayFactor);

        if (!dryRun && Math.abs(newConfidence - entity.confidence) > 0.01) {
          await Entity.findByIdAndUpdate(entity._id, {
            confidence: newConfidence,
          });
          decayed++;
        }
      }
    }

    return { decayed };
  }

  /**
   * Prune orphaned data
   * Removes data that's no longer referenced
   *
   * @param {Object} options - Prune options
   * @returns {Promise<Object>}
   */
  async pruneOrphanedData(options = {}) {
    const { dryRun = false } = options;
    let spaceSaved = 0;

    // Find orphaned summaries (conversation deleted)
    const orphanedSummaries = await ConversationSummary.aggregate([
      {
        $lookup: {
          from: 'conversations',
          localField: 'conversationId',
          foreignField: '_id',
          as: 'conversation',
        },
      },
      {
        $match: { conversation: { $size: 0 } },
      },
      {
        $project: { _id: 1 },
      },
    ]);

    if (!dryRun && orphanedSummaries.length > 0) {
      const ids = orphanedSummaries.map((s) => s._id);
      await ConversationSummary.deleteMany({ _id: { $in: ids } });
      spaceSaved += orphanedSummaries.length * 1000; // Estimate
    }

    // Find low-value entities (no mentions, no relationships)
    const lowValueEntities = await Entity.find({
      'stats.totalMentions': { $lt: 2 },
      'relationships.0': { $exists: false },
      confidence: { $lt: 0.3 },
    }).select('_id');

    if (!dryRun && lowValueEntities.length > 0) {
      const ids = lowValueEntities.map((e) => e._id);
      await Entity.deleteMany({ _id: { $in: ids } });
      spaceSaved += lowValueEntities.length * 500; // Estimate
    }

    logger.info('Pruned orphaned data', {
      service: 'memory-decay',
      orphanedSummaries: orphanedSummaries.length,
      lowValueEntities: lowValueEntities.length,
      spaceSaved,
    });

    return {
      orphanedSummaries: orphanedSummaries.length,
      lowValueEntities: lowValueEntities.length,
      spaceSaved,
    };
  }

  /**
   * Get memory statistics
   *
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async getMemoryStats(options = {}) {
    const { userId = null, workspaceId = null } = options;

    const conversationQuery = {};
    if (userId) conversationQuery.userId = userId;
    if (workspaceId) conversationQuery.workspaceId = workspaceId;

    const [
      totalConversations,
      totalMessages,
      totalSummaries,
      totalEntities,
      oldConversations,
      avgMessagesPerConversation,
    ] = await Promise.all([
      Conversation.countDocuments(conversationQuery),
      Message.countDocuments(),
      ConversationSummary.countDocuments(conversationQuery),
      Entity.countDocuments(workspaceId ? { workspaceId } : {}),
      Conversation.countDocuments({
        ...conversationQuery,
        updatedAt: {
          $lt: new Date(Date.now() - this.config.conversationMaxAgeDays * 24 * 60 * 60 * 1000),
        },
      }),
      Conversation.aggregate([
        { $match: conversationQuery },
        { $group: { _id: null, avg: { $avg: '$messageCount' } } },
      ]).then((r) => r[0]?.avg || 0),
    ]);

    return {
      conversations: {
        total: totalConversations,
        old: oldConversations,
        archivable: oldConversations,
      },
      messages: {
        total: totalMessages,
        avgPerConversation: Math.round(avgMessagesPerConversation),
      },
      summaries: {
        total: totalSummaries,
        coverage:
          totalConversations > 0
            ? ((totalSummaries / totalConversations) * 100).toFixed(1) + '%'
            : '0%',
      },
      entities: {
        total: totalEntities,
      },
      config: this.config,
    };
  }

  /**
   * Set retention policy
   *
   * @param {DecayConfig} config - New configuration
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    logger.info('Updated memory decay config', {
      service: 'memory-decay',
      config: this.config,
    });
  }
}

// Singleton instance
export const memoryDecay = new MemoryDecayManager();

// Export class for testing
export { MemoryDecayManager };

/**
 * Trigger manual memory decay via BullMQ queue
 * Prefer using this over direct runDecayProcess for production
 *
 * @param {Object} options - Decay options
 * @returns {Promise<Object>} Job info
 */
export async function triggerMemoryDecay(options = {}) {
  const { memoryDecayQueue } = await import('../../config/queue.js');

  const job = await memoryDecayQueue.add(
    'manual-memory-decay',
    {
      ...options,
      triggeredAt: new Date().toISOString(),
    },
    {
      priority: 1, // Higher priority than scheduled
    }
  );

  logger.info('Manual memory decay job queued', {
    service: 'memory-decay',
    jobId: job.id,
    options,
  });

  return {
    jobId: job.id,
    status: 'queued',
    message: 'Memory decay job has been queued for processing',
  };
}

/**
 * @deprecated Use BullMQ-based scheduling via queue.js scheduleMemoryDecayJob()
 * This function is kept for backward compatibility but does nothing.
 */
export function scheduleMemoryDecay(_options = {}) {
  logger.warn('scheduleMemoryDecay is deprecated. Use BullMQ scheduling instead.', {
    service: 'memory-decay',
  });

  // Return a dummy interval ID for backward compatibility
  return null;
}

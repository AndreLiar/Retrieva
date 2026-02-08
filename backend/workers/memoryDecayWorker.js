/**
 * Memory Decay Worker
 *
 * BullMQ worker for processing memory decay and archival jobs
 * Handles:
 * - Scheduled memory decay (runs daily)
 * - Manual decay triggers
 * - Archiving old conversations
 * - Entity confidence decay
 * - Orphaned data cleanup
 *
 * @module workers/memoryDecayWorker
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { memoryDecay } from '../services/memory/memoryDecay.js';
import { memoryMonitor } from '../services/memory/memoryMonitor.js';
import logger from '../config/logger.js';

// Dead Letter Queue for failed jobs
import { setupDLQListener } from '../services/deadLetterQueue.js';

let memoryDecayWorker = null;

/**
 * Memory Decay Job Types
 */
export const MemoryDecayJobTypes = {
  SCHEDULED: 'scheduled-memory-decay',
  MANUAL: 'manual-memory-decay',
  ARCHIVE_CONVERSATION: 'archive-conversation',
  ENTITY_DECAY: 'entity-decay',
  PRUNE_ORPHANS: 'prune-orphans',
};

/**
 * Process memory decay job
 *
 * @param {import('bullmq').Job} job - BullMQ job
 * @returns {Promise<Object>} Job result
 */
async function processMemoryDecayJob(job) {
  const startTime = Date.now();
  const { name, data } = job;

  logger.info('Processing memory decay job', {
    service: 'memory-decay-worker',
    jobId: job.id,
    jobName: name,
    data,
  });

  try {
    let result;

    switch (name) {
      case MemoryDecayJobTypes.SCHEDULED:
      case MemoryDecayJobTypes.MANUAL:
        // Full decay process
        result = await memoryDecay.runDecayProcess({
          dryRun: data.dryRun || false,
          userId: data.userId || null,
          workspaceId: data.workspaceId || null,
        });

        // Record metrics
        await memoryMonitor.recordDecayRun({
          type: name === MemoryDecayJobTypes.SCHEDULED ? 'scheduled' : 'manual',
          ...result,
          processingTimeMs: Date.now() - startTime,
        });
        break;

      case MemoryDecayJobTypes.ARCHIVE_CONVERSATION:
        // Archive specific conversation
        result = await memoryDecay.archiveOldConversations({
          dryRun: data.dryRun || false,
          userId: data.userId || null,
          workspaceId: data.workspaceId || null,
        });
        break;

      case MemoryDecayJobTypes.ENTITY_DECAY:
        // Apply entity decay only
        result = await memoryDecay.applyEntityDecay({
          dryRun: data.dryRun || false,
          workspaceId: data.workspaceId || null,
        });
        break;

      case MemoryDecayJobTypes.PRUNE_ORPHANS:
        // Prune orphaned data only
        result = await memoryDecay.pruneOrphanedData({
          dryRun: data.dryRun || false,
        });
        break;

      default:
        // Default to full decay
        result = await memoryDecay.runDecayProcess({
          dryRun: data.dryRun || false,
        });
    }

    const processingTime = Date.now() - startTime;

    logger.info('Memory decay job completed', {
      service: 'memory-decay-worker',
      jobId: job.id,
      jobName: name,
      result,
      processingTimeMs: processingTime,
    });

    return {
      success: true,
      ...result,
      processingTimeMs: processingTime,
    };
  } catch (error) {
    logger.error('Memory decay job failed', {
      service: 'memory-decay-worker',
      jobId: job.id,
      jobName: name,
      error: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime,
    });

    // Record failure
    await memoryMonitor.recordDecayFailure({
      jobId: job.id,
      jobName: name,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Start the memory decay worker
 *
 * @param {Object} options - Worker options
 * @returns {Worker} BullMQ worker instance
 */
export function startMemoryDecayWorker(options = {}) {
  const { concurrency = 1 } = options;

  if (memoryDecayWorker) {
    logger.warn('Memory decay worker already running', {
      service: 'memory-decay-worker',
    });
    return memoryDecayWorker;
  }

  memoryDecayWorker = new Worker('memoryDecay', processMemoryDecayJob, {
    connection: redisConnection,
    concurrency,
    limiter: {
      max: 1,
      duration: 60000, // Max 1 job per minute
    },
  });

  // Worker event handlers
  memoryDecayWorker.on('completed', (job, result) => {
    logger.debug('Memory decay job completed', {
      service: 'memory-decay-worker',
      jobId: job.id,
      result,
    });
  });

  memoryDecayWorker.on('failed', (job, error) => {
    logger.error('Memory decay job failed', {
      service: 'memory-decay-worker',
      jobId: job?.id,
      error: error.message,
    });
  });

  memoryDecayWorker.on('error', (error) => {
    logger.error('Memory decay worker error', {
      service: 'memory-decay-worker',
      error: error.message,
    });
  });

  memoryDecayWorker.on('stalled', (jobId) => {
    logger.warn('Memory decay job stalled', {
      service: 'memory-decay-worker',
      jobId,
    });
  });

  // Setup Dead Letter Queue listener for final failures
  setupDLQListener(memoryDecayWorker, 'memoryDecay');

  logger.info('Memory decay worker started', {
    service: 'memory-decay-worker',
    concurrency,
  });

  return memoryDecayWorker;
}

/**
 * Stop the memory decay worker
 *
 * @returns {Promise<void>}
 */
export async function stopMemoryDecayWorker() {
  if (memoryDecayWorker) {
    await memoryDecayWorker.close();
    memoryDecayWorker = null;
    logger.info('Memory decay worker stopped', {
      service: 'memory-decay-worker',
    });
  }
}

/**
 * Get worker status
 *
 * @returns {Object} Worker status
 */
export function getMemoryDecayWorkerStatus() {
  if (!memoryDecayWorker) {
    return { running: false };
  }

  return {
    running: true,
    name: memoryDecayWorker.name,
    concurrency: memoryDecayWorker.opts.concurrency,
  };
}

export default {
  startMemoryDecayWorker,
  stopMemoryDecayWorker,
  getMemoryDecayWorkerStatus,
  MemoryDecayJobTypes,
};

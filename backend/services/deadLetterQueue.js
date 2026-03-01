/**
 * Dead Letter Queue Service
 *
 * Manages failed jobs that have exhausted all retry attempts.
 * Provides:
 * - Automatic routing of failed jobs to DLQ
 * - Monitoring and statistics
 * - Manual retry capabilities
 * - Notification hooks for alerting
 *
 * @module services/deadLetterQueue
 */

import { DeadLetterJob } from '../models/DeadLetterJob.js';
import logger from '../config/logger.js';
import { documentIndexQueue, memoryDecayQueue } from '../config/queue.js';

/**
 * Route a failed job to the Dead Letter Queue
 *
 * @param {Object} job - BullMQ job object
 * @param {Error} error - The error that caused the failure
 * @param {string} queueName - Name of the queue the job failed in
 * @returns {Promise<Object>} Created DLQ entry
 */
export async function routeToDeadLetterQueue(job, error, queueName) {
  try {
    // Extract context from job data for easier querying
    const jobData = job.data || {};
    const workspaceId = jobData.workspaceId || null;
    const sourceId = jobData.sourceId || null;

    const dlqEntry = new DeadLetterJob({
      originalJobId: job.id,
      queueName,
      jobName: job.name,
      jobData: job.data,
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        code: error.code,
      },
      attemptsMade: job.attemptsMade || 0,
      maxAttempts: job.opts?.attempts || 3,
      workspaceId,
      sourceId,
      metadata: {
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp,
        delay: job.delay,
        priority: job.opts?.priority,
      },
    });

    await dlqEntry.save();

    logger.warn('Job routed to Dead Letter Queue', {
      service: 'dlq',
      queueName,
      jobId: job.id,
      jobName: job.name,
      workspaceId,
      sourceId,
      error: error.message,
      attemptsMade: job.attemptsMade,
      dlqId: dlqEntry._id.toString(),
    });

    // Emit event for potential alerting
    emitDLQEvent('job_added', {
      dlqId: dlqEntry._id.toString(),
      queueName,
      jobId: job.id,
      error: error.message,
    });

    return dlqEntry;
  } catch (dlqError) {
    // DLQ routing failed - log but don't throw (best effort)
    logger.error('Failed to route job to DLQ', {
      service: 'dlq',
      queueName,
      jobId: job.id,
      originalError: error.message,
      dlqError: dlqError.message,
    });
    return null;
  }
}

/**
 * Event emitter for DLQ events (can be extended for Slack/email alerts)
 */
const dlqEventListeners = [];

export function onDLQEvent(callback) {
  dlqEventListeners.push(callback);
}

function emitDLQEvent(eventType, data) {
  for (const listener of dlqEventListeners) {
    try {
      listener(eventType, data);
    } catch (error) {
      logger.error('DLQ event listener error', { error: error.message });
    }
  }
}

/**
 * Retry a DLQ entry by re-adding it to the original queue
 *
 * @param {string} dlqId - DLQ entry ID
 * @param {string} retryBy - User/system initiating the retry
 * @returns {Promise<Object>} Result of retry attempt
 */
export async function retryDLQEntry(dlqId, retryBy = 'system') {
  const dlqEntry = await DeadLetterJob.findById(dlqId);
  if (!dlqEntry) {
    throw new Error(`DLQ entry not found: ${dlqId}`);
  }

  if (dlqEntry.status !== 'pending') {
    throw new Error(`Cannot retry DLQ entry with status: ${dlqEntry.status}`);
  }

  // Get the appropriate queue
  const queue = getQueueByName(dlqEntry.queueName);
  if (!queue) {
    throw new Error(`Unknown queue: ${dlqEntry.queueName}`);
  }

  try {
    // Mark as retrying
    dlqEntry.status = 'retrying';
    dlqEntry.retryCount += 1;
    dlqEntry.lastRetryAt = new Date();
    await dlqEntry.save();

    // Add job back to queue with fresh retry attempts
    const newJob = await queue.add(dlqEntry.jobName || 'retry', dlqEntry.jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    });

    logger.info('DLQ entry retried', {
      service: 'dlq',
      dlqId,
      queueName: dlqEntry.queueName,
      newJobId: newJob.id,
      retryBy,
    });

    // Mark as resolved (success will be determined by new job outcome)
    dlqEntry.status = 'resolved';
    dlqEntry.resolvedAt = new Date();
    dlqEntry.resolvedBy = retryBy;
    dlqEntry.resolution = 'retried_success';
    await dlqEntry.save();

    return {
      success: true,
      dlqId,
      newJobId: newJob.id,
    };
  } catch (retryError) {
    // Retry failed
    dlqEntry.status = 'pending';
    dlqEntry.lastRetryError = retryError.message;
    await dlqEntry.save();

    logger.error('DLQ retry failed', {
      service: 'dlq',
      dlqId,
      error: retryError.message,
    });

    return {
      success: false,
      dlqId,
      error: retryError.message,
    };
  }
}

/**
 * Dismiss a DLQ entry (acknowledge and remove from pending)
 *
 * @param {string} dlqId - DLQ entry ID
 * @param {string} dismissedBy - User dismissing the entry
 * @param {string} notes - Optional notes about why dismissed
 * @returns {Promise<Object>} Updated DLQ entry
 */
export async function dismissDLQEntry(dlqId, dismissedBy, notes = null) {
  const dlqEntry = await DeadLetterJob.findById(dlqId);
  if (!dlqEntry) {
    throw new Error(`DLQ entry not found: ${dlqId}`);
  }

  await dlqEntry.dismiss(dismissedBy, notes);

  logger.info('DLQ entry dismissed', {
    service: 'dlq',
    dlqId,
    queueName: dlqEntry.queueName,
    dismissedBy,
  });

  return dlqEntry;
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats() {
  return DeadLetterJob.getStats();
}

/**
 * Get pending DLQ entries with pagination
 */
export async function getPendingDLQEntries(options = {}) {
  const { queueName = null, workspaceId = null, limit = 50, offset = 0 } = options;

  const query = { status: 'pending' };
  if (queueName) query.queueName = queueName;
  if (workspaceId) query.workspaceId = workspaceId;

  const [entries, total] = await Promise.all([
    DeadLetterJob.find(query).sort({ failedAt: -1 }).skip(offset).limit(limit).lean(),
    DeadLetterJob.countDocuments(query),
  ]);

  return {
    entries,
    total,
    limit,
    offset,
    hasMore: offset + entries.length < total,
  };
}

/**
 * Get a specific DLQ entry by ID
 */
export async function getDLQEntry(dlqId) {
  return DeadLetterJob.findById(dlqId);
}

/**
 * Bulk dismiss old DLQ entries
 */
export async function bulkDismissOld(olderThanDays = 7, dismissedBy = 'system') {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await DeadLetterJob.updateMany(
    {
      status: 'pending',
      failedAt: { $lt: cutoffDate },
    },
    {
      $set: {
        status: 'dismissed',
        resolvedAt: new Date(),
        resolvedBy: dismissedBy,
        resolution: 'expired',
        resolutionNotes: `Auto-dismissed after ${olderThanDays} days`,
      },
    }
  );

  if (result.modifiedCount > 0) {
    logger.info('Bulk dismissed old DLQ entries', {
      service: 'dlq',
      count: result.modifiedCount,
      olderThanDays,
    });
  }

  return result.modifiedCount;
}

/**
 * Get queue by name
 */
function getQueueByName(queueName) {
  const queues = {
    documentIndex: documentIndexQueue,
    memoryDecay: memoryDecayQueue,
  };
  return queues[queueName] || null;
}

/**
 * Setup DLQ listeners for a worker
 * Call this after creating each worker to enable DLQ routing
 *
 * @param {Worker} worker - BullMQ Worker instance
 * @param {string} queueName - Name of the queue
 */
export function setupDLQListener(worker, queueName) {
  worker.on('failed', async (job, error) => {
    // Check if all retries are exhausted
    const maxAttempts = job.opts?.attempts || 1;
    const attemptsMade = job.attemptsMade || 0;

    if (attemptsMade >= maxAttempts) {
      // All retries exhausted - route to DLQ
      await routeToDeadLetterQueue(job, error, queueName);
    }
  });

  logger.debug(`DLQ listener attached to ${queueName} worker`, { service: 'dlq' });
}

export default {
  routeToDeadLetterQueue,
  retryDLQEntry,
  dismissDLQEntry,
  getDLQStats,
  getPendingDLQEntries,
  getDLQEntry,
  bulkDismissOld,
  setupDLQListener,
  onDLQEvent,
};

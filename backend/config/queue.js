import 'dotenv/config';
import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';
import logger from './logger.js';

const SYNC_MAX_RETRIES = parseInt(process.env.SYNC_MAX_RETRIES) || 3;
const MEMORY_DECAY_INTERVAL_HOURS = parseInt(process.env.MEMORY_DECAY_INTERVAL_HOURS) || 24;

/**
 * Queue for Notion workspace synchronization jobs
 * Handles full sync, incremental sync, and scheduled sync operations
 */
export const notionSyncQueue = new Queue('notionSync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: SYNC_MAX_RETRIES,
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 1 minute
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 7 * 24 * 60 * 60, // Remove after 7 days
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
    },
  },
});

/**
 * Queue for document indexing operations
 * Processes individual documents and indexes them in Qdrant
 * ISSUE #18 FIX: Changed to exponential backoff for better retry behavior
 */
export const documentIndexQueue = new Queue('documentIndex', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Increased from 2 for better recovery
    backoff: {
      type: 'exponential',
      delay: 30000, // Start with 30 seconds, then 60s, then 120s
    },
    removeOnComplete: {
      count: 1000,
      age: 3 * 24 * 60 * 60, // Remove after 3 days
    },
    removeOnFail: {
      count: 1000,
    },
  },
});

/**
 * Queue for memory decay and archival operations
 * Handles:
 * - Archiving old conversations
 * - Entity decay processing
 * - Orphaned data cleanup
 */
export const memoryDecayQueue = new Queue('memoryDecay', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 1 minute
    },
    removeOnComplete: {
      count: 50,
      age: 7 * 24 * 60 * 60, // Keep for 7 days
    },
    removeOnFail: {
      count: 100,
    },
  },
});

/**
 * Schedule recurring memory decay job
 * Runs every 24 hours by default
 */
export async function scheduleMemoryDecayJob() {
  const jobName = 'scheduled-memory-decay';

  // Remove existing repeatable job if any
  const existingJobs = await memoryDecayQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === jobName) {
      await memoryDecayQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule new repeatable job
  await memoryDecayQueue.add(
    jobName,
    { scheduled: true, timestamp: new Date().toISOString() },
    {
      repeat: {
        every: MEMORY_DECAY_INTERVAL_HOURS * 60 * 60 * 1000, // Convert hours to ms
      },
      jobId: 'memory-decay-scheduled',
    }
  );

  logger.info('Memory decay job scheduled', {
    service: 'queue',
    intervalHours: MEMORY_DECAY_INTERVAL_HOURS,
  });
}

// ISSUE #34 FIX: Store event listener references for cleanup
const queueEventListeners = {
  notionSync: null,
  documentIndex: null,
  memoryDecay: null,
};

// Log queue events with stored references
queueEventListeners.notionSync = (error) => {
  logger.error('Notion sync queue error:', { error: error.message, stack: error.stack });
};
notionSyncQueue.on('error', queueEventListeners.notionSync);

queueEventListeners.documentIndex = (error) => {
  logger.error('Document index queue error:', { error: error.message, stack: error.stack });
};
documentIndexQueue.on('error', queueEventListeners.documentIndex);

queueEventListeners.memoryDecay = (error) => {
  logger.error('Memory decay queue error:', { error: error.message, stack: error.stack });
};
memoryDecayQueue.on('error', queueEventListeners.memoryDecay);

logger.info('BullMQ queues initialized successfully');

/**
 * Gracefully close all queues
 * ISSUE #34 FIX: Remove event listeners before closing
 */
export const closeQueues = async () => {
  try {
    // Remove event listeners to prevent memory leaks
    if (queueEventListeners.notionSync) {
      notionSyncQueue.off('error', queueEventListeners.notionSync);
    }
    if (queueEventListeners.documentIndex) {
      documentIndexQueue.off('error', queueEventListeners.documentIndex);
    }
    if (queueEventListeners.memoryDecay) {
      memoryDecayQueue.off('error', queueEventListeners.memoryDecay);
    }

    await Promise.all([
      notionSyncQueue.close(),
      documentIndexQueue.close(),
      memoryDecayQueue.close(),
    ]);
    logger.info('All queues closed gracefully');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
};

export default {
  notionSyncQueue,
  documentIndexQueue,
  memoryDecayQueue,
  scheduleMemoryDecayJob,
  closeQueues,
};

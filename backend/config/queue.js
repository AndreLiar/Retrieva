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
 */
export const documentIndexQueue = new Queue('documentIndex', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 30000, // 30 seconds
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

// Log queue events
notionSyncQueue.on('error', (error) => {
  logger.error('Notion sync queue error:', error);
});

documentIndexQueue.on('error', (error) => {
  logger.error('Document index queue error:', error);
});

memoryDecayQueue.on('error', (error) => {
  logger.error('Memory decay queue error:', error);
});

logger.info('BullMQ queues initialized successfully');

/**
 * Gracefully close all queues
 */
export const closeQueues = async () => {
  try {
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

import 'dotenv/config';
import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';
import logger from './logger.js';

const MEMORY_DECAY_INTERVAL_HOURS = parseInt(process.env.MEMORY_DECAY_INTERVAL_HOURS) || 24;
const MONITORING_INTERVAL_HOURS = parseInt(process.env.MONITORING_INTERVAL_HOURS) || 24;

/**
 * Queue for assessment file indexing and gap analysis jobs
 * Handles:
 * - Parsing + embedding uploaded vendor documents
 * - Running the DORA gap analysis agent after indexing
 */
export const assessmentQueue = new Queue('assessmentJobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
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
 * Queue for vendor questionnaire scoring jobs
 * Handles LLM-based per-question scoring and executive summary generation
 */
export const questionnaireQueue = new Queue('questionnaireJobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
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
 * Queue for compliance monitoring alert jobs
 * Handles:
 * - Certification expiry alerts (90/30/7 days)
 * - Contract renewal alerts (60 days)
 * - Annual review overdue alerts
 * - Assessment overdue alerts (12 months)
 */
export const monitoringQueue = new Queue('monitoringJobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 60_000,
    },
    removeOnComplete: {
      count: 10,
    },
    removeOnFail: {
      count: 20,
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
      count: 10,
      age: 24 * 60 * 60, // Keep for 1 day
    },
    removeOnFail: {
      count: 20,
    },
  },
});

/**
 * Helper: wrap a promise with a timeout
 */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const QUEUE_OP_TIMEOUT = parseInt(process.env.QUEUE_OP_TIMEOUT_MS) || 10000;

/**
 * Schedule recurring memory decay job
 * Runs every 24 hours by default
 */
export async function scheduleMemoryDecayJob() {
  const jobName = 'scheduled-memory-decay';

  // Remove existing repeatable job if any (with timeout to prevent hanging)
  const existingJobs = await withTimeout(memoryDecayQueue.getRepeatableJobs(), QUEUE_OP_TIMEOUT);
  for (const job of existingJobs) {
    if (job.name === jobName) {
      await withTimeout(memoryDecayQueue.removeRepeatableByKey(job.key), QUEUE_OP_TIMEOUT);
    }
  }

  // Schedule new repeatable job
  await withTimeout(
    memoryDecayQueue.add(
      jobName,
      { scheduled: true, timestamp: new Date().toISOString() },
      {
        repeat: {
          every: MEMORY_DECAY_INTERVAL_HOURS * 60 * 60 * 1000, // Convert hours to ms
        },
        jobId: 'memory-decay-scheduled',
      }
    ),
    QUEUE_OP_TIMEOUT
  );

  logger.info('Memory decay job scheduled', {
    service: 'queue',
    intervalHours: MEMORY_DECAY_INTERVAL_HOURS,
  });
}

/**
 * Schedule recurring monitoring alerts job
 * Runs every 24 hours by default
 */
export async function scheduleMonitoringJob() {
  const jobName = 'run-monitoring-alerts';

  const existingJobs = await withTimeout(monitoringQueue.getRepeatableJobs(), QUEUE_OP_TIMEOUT);
  for (const job of existingJobs) {
    if (job.name === jobName) {
      await withTimeout(monitoringQueue.removeRepeatableByKey(job.key), QUEUE_OP_TIMEOUT);
    }
  }

  await withTimeout(
    monitoringQueue.add(
      jobName,
      { scheduled: true },
      {
        repeat: {
          every: MONITORING_INTERVAL_HOURS * 60 * 60 * 1000,
        },
        jobId: 'monitoring-alerts-scheduled',
      }
    ),
    QUEUE_OP_TIMEOUT
  );

  logger.info('Monitoring alerts job scheduled', {
    service: 'queue',
    intervalHours: MONITORING_INTERVAL_HOURS,
  });
}

// ISSUE #34 FIX: Store event listener references for cleanup
const queueEventListeners = {
  memoryDecay: null,
  assessmentJobs: null,
  questionnaireJobs: null,
  monitoringJobs: null,
};

// Log queue events with stored references
queueEventListeners.memoryDecay = (error) => {
  logger.error('Memory decay queue error:', { error: error.message, stack: error.stack });
};
memoryDecayQueue.on('error', queueEventListeners.memoryDecay);

queueEventListeners.assessmentJobs = (error) => {
  logger.error('Assessment jobs queue error:', { error: error.message, stack: error.stack });
};
assessmentQueue.on('error', queueEventListeners.assessmentJobs);

queueEventListeners.questionnaireJobs = (error) => {
  logger.error('Questionnaire jobs queue error:', { error: error.message, stack: error.stack });
};
questionnaireQueue.on('error', queueEventListeners.questionnaireJobs);

queueEventListeners.monitoringJobs = (error) => {
  logger.error('Monitoring jobs queue error:', { error: error.message, stack: error.stack });
};
monitoringQueue.on('error', queueEventListeners.monitoringJobs);

logger.info('BullMQ queues initialized successfully');

/**
 * Gracefully close all queues
 * ISSUE #34 FIX: Remove event listeners before closing
 */
export const closeQueues = async () => {
  try {
    // Remove event listeners to prevent memory leaks
    if (queueEventListeners.memoryDecay) {
      memoryDecayQueue.off('error', queueEventListeners.memoryDecay);
    }
    if (queueEventListeners.assessmentJobs) {
      assessmentQueue.off('error', queueEventListeners.assessmentJobs);
    }

    if (queueEventListeners.questionnaireJobs) {
      questionnaireQueue.off('error', queueEventListeners.questionnaireJobs);
    }

    if (queueEventListeners.monitoringJobs) {
      monitoringQueue.off('error', queueEventListeners.monitoringJobs);
    }

    await Promise.all([
      memoryDecayQueue.close(),
      assessmentQueue.close(),
      questionnaireQueue.close(),
      monitoringQueue.close(),
    ]);
    logger.info('All queues closed gracefully');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
};

export default {
  memoryDecayQueue,
  assessmentQueue,
  questionnaireQueue,
  monitoringQueue,
  scheduleMemoryDecayJob,
  scheduleMonitoringJob,
  closeQueues,
};

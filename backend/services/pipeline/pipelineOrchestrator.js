import { Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import { connectDB } from '../../config/database.js';
import logger from '../../config/logger.js';
import {
  PipelineStage,
  STAGE_ORDER,
  generateIdempotencyKey,
  isAlreadyProcessed,
  markAsProcessed,
  getPipelineQueue,
  getStageMetrics,
} from './pipelineStages.js';
import { stageHandlers } from './stageHandlers.js';

/**
 * Phase 3: Pipeline Orchestrator
 *
 * Manages document processing through discrete pipeline stages.
 * Each stage has its own queue and can scale independently.
 *
 * Features:
 * - Idempotency: Same job won't be processed twice
 * - Isolation: Stage failures don't affect other stages
 * - Metrics: Per-stage timing and success rates
 * - Recovery: Failed jobs can retry from last successful stage
 */

// =============================================================================
// PIPELINE CONFIGURATION
// =============================================================================

const PIPELINE_CONFIG = {
  // Worker concurrency per stage
  concurrency: {
    [PipelineStage.FETCH]: parseInt(process.env.PIPELINE_FETCH_CONCURRENCY) || 5,
    [PipelineStage.CHUNK]: parseInt(process.env.PIPELINE_CHUNK_CONCURRENCY) || 5,
    [PipelineStage.PII_SCAN]: parseInt(process.env.PIPELINE_PII_CONCURRENCY) || 10,
    [PipelineStage.EMBED]: parseInt(process.env.PIPELINE_EMBED_CONCURRENCY) || 3, // Limited for Ollama
    [PipelineStage.INDEX]: parseInt(process.env.PIPELINE_INDEX_CONCURRENCY) || 5,
    [PipelineStage.ENRICH]: parseInt(process.env.PIPELINE_ENRICH_CONCURRENCY) || 2, // LLM intensive
  },

  // Lock durations per stage (ms)
  lockDuration: {
    [PipelineStage.FETCH]: 60000, // 1 min
    [PipelineStage.CHUNK]: 120000, // 2 min
    [PipelineStage.PII_SCAN]: 60000, // 1 min
    [PipelineStage.EMBED]: 600000, // 10 min (slow with Ollama)
    [PipelineStage.INDEX]: 300000, // 5 min
    [PipelineStage.ENRICH]: 600000, // 10 min (LLM processing)
  },
};

// =============================================================================
// PIPELINE WORKERS
// =============================================================================

const pipelineWorkers = {};

/**
 * Create a worker for a specific pipeline stage
 */
function createStageWorker(stage) {
  const handler = stageHandlers[stage];
  if (!handler) {
    throw new Error(`No handler defined for stage: ${stage}`);
  }

  const worker = new Worker(
    `pipeline:${stage}`,
    async (job) => {
      const { idempotencyKey, workspaceId, sourceId } = job.data;
      const startTime = Date.now();

      logger.info(`Pipeline stage ${stage} starting`, {
        service: 'pipeline',
        stage,
        jobId: job.id,
        workspaceId,
        sourceId,
      });

      try {
        // Check idempotency (skip if already processed)
        if (idempotencyKey && isAlreadyProcessed(idempotencyKey)) {
          logger.debug(`Skipping duplicate job: ${idempotencyKey}`, {
            service: 'pipeline',
            stage,
          });
          return { skipped: true, reason: 'duplicate' };
        }

        // Report progress
        await job.updateProgress({ phase: stage, status: 'processing' });

        // Execute stage handler
        const result = await handler(job.data);

        // Mark as processed for idempotency
        if (idempotencyKey) {
          markAsProcessed(idempotencyKey, { stage, success: true });
        }

        // Queue next stage if not last
        const currentIndex = STAGE_ORDER.indexOf(stage);
        if (currentIndex < STAGE_ORDER.length - 1) {
          const nextStage = STAGE_ORDER[currentIndex + 1];
          const nextQueue = getPipelineQueue(nextStage);

          // Generate new idempotency key for next stage
          const nextIdempotencyKey = generateIdempotencyKey(
            workspaceId,
            sourceId,
            nextStage,
            result.contentHash
          );

          await nextQueue.add(nextStage, {
            ...result,
            idempotencyKey: nextIdempotencyKey,
            previousStage: stage,
            pipelineStartTime: job.data.pipelineStartTime,
          });

          logger.debug(`Queued next stage: ${nextStage}`, {
            service: 'pipeline',
            stage,
            nextStage,
            workspaceId,
            sourceId,
          });
        } else {
          // Final stage completed - log pipeline completion
          const totalDuration = Date.now() - (job.data.pipelineStartTime || startTime);
          logger.info('Pipeline completed', {
            service: 'pipeline',
            workspaceId,
            sourceId,
            totalDurationMs: totalDuration,
            stages: STAGE_ORDER.length,
          });
        }

        return result;
      } catch (error) {
        logger.error(`Pipeline stage ${stage} failed`, {
          service: 'pipeline',
          stage,
          jobId: job.id,
          workspaceId,
          sourceId,
          error: error.message,
          durationMs: Date.now() - startTime,
        });
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: PIPELINE_CONFIG.concurrency[stage],
      lockDuration: PIPELINE_CONFIG.lockDuration[stage],
      lockRenewTime: Math.floor(PIPELINE_CONFIG.lockDuration[stage] / 2.5),
    }
  );

  // Worker event handlers
  worker.on('completed', (job, result) => {
    if (!result?.skipped) {
      logger.debug(`Pipeline stage ${stage} job completed`, {
        service: 'pipeline',
        stage,
        jobId: job.id,
      });
    }
  });

  worker.on('failed', (job, err) => {
    logger.error(`Pipeline stage ${stage} job failed`, {
      service: 'pipeline',
      stage,
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error(`Pipeline stage ${stage} worker error`, {
      service: 'pipeline',
      stage,
      error: err.message,
    });
  });

  return worker;
}

// =============================================================================
// ORCHESTRATOR FUNCTIONS
// =============================================================================

/**
 * Start the pipeline by adding a job to the FETCH stage
 */
export async function startPipeline(data) {
  const { workspaceId, sourceId, documentContent, operation = 'add', skipM3 = false } = data;

  // Generate idempotency key for the first stage
  const idempotencyKey = generateIdempotencyKey(
    workspaceId,
    sourceId,
    PipelineStage.FETCH,
    documentContent?.contentHash
  );

  // Check if this exact job is already being processed
  if (isAlreadyProcessed(idempotencyKey)) {
    logger.debug('Pipeline job already processed, skipping', {
      service: 'pipeline',
      workspaceId,
      sourceId,
    });
    return null;
  }

  const queue = getPipelineQueue(PipelineStage.FETCH);
  const job = await queue.add(PipelineStage.FETCH, {
    workspaceId,
    sourceId,
    documentContent,
    operation,
    skipM3,
    idempotencyKey,
    pipelineStartTime: Date.now(),
  });

  logger.info('Pipeline started', {
    service: 'pipeline',
    workspaceId,
    sourceId,
    jobId: job.id,
    operation,
  });

  return job;
}

/**
 * Start pipeline from a specific stage (for recovery/retry)
 */
export async function startPipelineFromStage(stage, data) {
  const { workspaceId, sourceId } = data;

  const stageIndex = STAGE_ORDER.indexOf(stage);
  if (stageIndex === -1) {
    throw new Error(`Invalid pipeline stage: ${stage}`);
  }

  const idempotencyKey = generateIdempotencyKey(workspaceId, sourceId, stage, data.contentHash);

  const queue = getPipelineQueue(stage);
  const job = await queue.add(stage, {
    ...data,
    idempotencyKey,
    pipelineStartTime: Date.now(),
    recoveryMode: true,
    startedFromStage: stage,
  });

  logger.info('Pipeline started from specific stage', {
    service: 'pipeline',
    workspaceId,
    sourceId,
    stage,
    jobId: job.id,
  });

  return job;
}

/**
 * Initialize all pipeline workers
 */
export async function initializePipelineWorkers() {
  await connectDB();

  for (const stage of STAGE_ORDER) {
    if (!pipelineWorkers[stage]) {
      pipelineWorkers[stage] = createStageWorker(stage);
      logger.info(`Pipeline worker initialized for stage: ${stage}`, {
        service: 'pipeline',
        concurrency: PIPELINE_CONFIG.concurrency[stage],
      });
    }
  }

  logger.info('All pipeline workers initialized', {
    service: 'pipeline',
    stages: STAGE_ORDER.length,
  });

  return pipelineWorkers;
}

/**
 * Stop all pipeline workers
 */
export async function stopPipelineWorkers() {
  const closePromises = Object.entries(pipelineWorkers).map(async ([stage, worker]) => {
    try {
      await worker.close();
      logger.info(`Pipeline worker closed for stage: ${stage}`, { service: 'pipeline' });
    } catch (error) {
      logger.error(`Error closing pipeline worker for stage: ${stage}`, {
        service: 'pipeline',
        error: error.message,
      });
    }
  });

  await Promise.all(closePromises);
  logger.info('All pipeline workers stopped', { service: 'pipeline' });
}

/**
 * Get comprehensive pipeline status
 */
export async function getPipelineHealthStatus() {
  const status = {
    healthy: true,
    workers: {},
    queues: {},
    metrics: getStageMetrics(),
    config: PIPELINE_CONFIG,
  };

  for (const stage of STAGE_ORDER) {
    // Worker status
    const worker = pipelineWorkers[stage];
    status.workers[stage] = {
      running: worker?.isRunning() ?? false,
      paused: worker?.isPaused() ?? true,
    };

    // Queue status
    try {
      const queue = getPipelineQueue(stage);
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      status.queues[stage] = { waiting, active, completed, failed };

      // Mark unhealthy if too many failures
      if (failed > 100) {
        status.healthy = false;
      }
    } catch (error) {
      status.queues[stage] = { error: error.message };
      status.healthy = false;
    }
  }

  return status;
}

/**
 * Drain a specific stage queue (remove all waiting jobs)
 */
export async function drainStageQueue(stage) {
  const queue = getPipelineQueue(stage);
  await queue.drain();

  logger.info(`Drained pipeline queue for stage: ${stage}`, { service: 'pipeline' });
}

/**
 * Retry failed jobs in a stage
 */
export async function retryFailedJobs(stage, limit = 100) {
  const queue = getPipelineQueue(stage);
  const failedJobs = await queue.getFailed(0, limit);

  let retriedCount = 0;
  for (const job of failedJobs) {
    try {
      await job.retry();
      retriedCount++;
    } catch (error) {
      logger.warn(`Failed to retry job ${job.id}`, {
        service: 'pipeline',
        stage,
        error: error.message,
      });
    }
  }

  logger.info(`Retried ${retriedCount} failed jobs in stage: ${stage}`, {
    service: 'pipeline',
    stage,
  });

  return retriedCount;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  startPipeline,
  startPipelineFromStage,
  initializePipelineWorkers,
  stopPipelineWorkers,
  getPipelineHealthStatus,
  drainStageQueue,
  retryFailedJobs,
  PIPELINE_CONFIG,
};

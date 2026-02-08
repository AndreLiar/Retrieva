import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import logger from '../../config/logger.js';
import crypto from 'crypto';

/**
 * Phase 3: Pipeline Architecture
 *
 * Document processing is split into discrete stages:
 * 1. FETCH - Fetch document from Notion
 * 2. CHUNK - Semantic chunking
 * 3. PII_SCAN - PII detection and trust level management
 * 4. EMBED - Generate embeddings (local or cloud)
 * 5. INDEX - Store in vector database
 * 6. ENRICH - M3 memory (summaries, entities)
 *
 * Benefits:
 * - Independent scaling per stage
 * - Better failure isolation
 * - Detailed per-stage metrics
 * - Idempotency support
 */

// =============================================================================
// PIPELINE STAGE DEFINITIONS
// =============================================================================

export const PipelineStage = {
  FETCH: 'fetch',
  CHUNK: 'chunk',
  PII_SCAN: 'pii_scan',
  EMBED: 'embed',
  INDEX: 'index',
  ENRICH: 'enrich',
};

export const STAGE_ORDER = [
  PipelineStage.FETCH,
  PipelineStage.CHUNK,
  PipelineStage.PII_SCAN,
  PipelineStage.EMBED,
  PipelineStage.INDEX,
  PipelineStage.ENRICH,
];

// =============================================================================
// IDEMPOTENCY KEYS
// =============================================================================

/**
 * Generate idempotency key for a pipeline job
 * Ensures same job isn't processed multiple times
 */
export function generateIdempotencyKey(workspaceId, sourceId, stage, contentHash = null) {
  const data = `${workspaceId}:${sourceId}:${stage}:${contentHash || 'none'}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Check if job with idempotency key already processed
 */
const processedKeys = new Map(); // In production, use Redis
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function isAlreadyProcessed(idempotencyKey) {
  const entry = processedKeys.get(idempotencyKey);
  if (!entry) return false;
  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL) {
    processedKeys.delete(idempotencyKey);
    return false;
  }
  return true;
}

export function markAsProcessed(idempotencyKey, result = null) {
  processedKeys.set(idempotencyKey, {
    timestamp: Date.now(),
    result,
  });
}

// =============================================================================
// PER-STAGE METRICS
// =============================================================================

const stageMetrics = {
  [PipelineStage.FETCH]: createStageMetrics(),
  [PipelineStage.CHUNK]: createStageMetrics(),
  [PipelineStage.PII_SCAN]: createStageMetrics(),
  [PipelineStage.EMBED]: createStageMetrics(),
  [PipelineStage.INDEX]: createStageMetrics(),
  [PipelineStage.ENRICH]: createStageMetrics(),
};

function createStageMetrics() {
  return {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalTimeMs: 0,
    avgTimeMs: 0,
    lastError: null,
    lastProcessedAt: null,
    itemsProcessed: 0, // e.g., chunks, embeddings
  };
}

export function recordStageMetrics(stage, success, timeMs, itemCount = 1, error = null) {
  const metrics = stageMetrics[stage];
  if (!metrics) return;

  metrics.totalJobs++;
  metrics.totalTimeMs += timeMs;
  metrics.avgTimeMs = metrics.totalTimeMs / metrics.totalJobs;
  metrics.lastProcessedAt = new Date().toISOString();
  metrics.itemsProcessed += itemCount;

  if (success) {
    metrics.completedJobs++;
  } else {
    metrics.failedJobs++;
    metrics.lastError = error?.message || error || 'Unknown error';
  }
}

export function getStageMetrics(stage = null) {
  if (stage) {
    return { [stage]: { ...stageMetrics[stage] } };
  }
  return Object.fromEntries(
    Object.entries(stageMetrics).map(([s, m]) => [s, { ...m }])
  );
}

export function resetStageMetrics(stage = null) {
  if (stage) {
    stageMetrics[stage] = createStageMetrics();
  } else {
    for (const s of STAGE_ORDER) {
      stageMetrics[s] = createStageMetrics();
    }
  }
}

// =============================================================================
// PIPELINE QUEUES
// =============================================================================

const pipelineQueues = {};

export function getPipelineQueue(stage) {
  if (!pipelineQueues[stage]) {
    pipelineQueues[stage] = new Queue(`pipeline:${stage}`, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
  }
  return pipelineQueues[stage];
}

/**
 * Add job to pipeline stage
 */
export async function addToPipeline(stage, data, options = {}) {
  const queue = getPipelineQueue(stage);
  const idempotencyKey = generateIdempotencyKey(
    data.workspaceId,
    data.sourceId,
    stage,
    data.contentHash
  );

  // Check idempotency
  if (!options.force && isAlreadyProcessed(idempotencyKey)) {
    logger.debug(`Skipping duplicate job: ${idempotencyKey}`, {
      service: 'pipeline',
      stage,
      sourceId: data.sourceId,
    });
    return null;
  }

  const job = await queue.add(stage, {
    ...data,
    idempotencyKey,
    stage,
    createdAt: new Date().toISOString(),
  }, {
    ...options,
    jobId: idempotencyKey, // Use idempotency key as job ID
  });

  logger.debug(`Added job to pipeline stage: ${stage}`, {
    service: 'pipeline',
    stage,
    jobId: job.id,
    sourceId: data.sourceId,
  });

  return job;
}

/**
 * Move job to next pipeline stage
 */
export async function moveToNextStage(currentStage, data, result = {}) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex === STAGE_ORDER.length - 1) {
    // Last stage or unknown stage
    return null;
  }

  const nextStage = STAGE_ORDER[currentIndex + 1];

  // Mark current stage as processed
  markAsProcessed(data.idempotencyKey, result);

  // Add to next stage
  return addToPipeline(nextStage, {
    ...data,
    ...result,
    previousStage: currentStage,
  });
}

// =============================================================================
// EMBEDDING VERSION TRACKING
// =============================================================================

export const EMBEDDING_VERSION = {
  current: '2.0.0', // Phase 2 hybrid system
  local: {
    model: process.env.EMBEDDING_MODEL || 'bge-m3:latest',
    dimensions: 1024,
  },
  cloud: {
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: 1536,
  },
};

/**
 * Create embedding metadata for storage
 */
export function createEmbeddingMetadata(provider, chunkCount, options = {}) {
  const config = provider === 'cloud' ? EMBEDDING_VERSION.cloud : EMBEDDING_VERSION.local;

  return {
    version: EMBEDDING_VERSION.current,
    provider,
    model: config.model,
    dimensions: config.dimensions,
    chunkCount,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Check if embeddings need migration
 */
export function needsEmbeddingMigration(metadata) {
  if (!metadata?.version) return true;
  if (metadata.version !== EMBEDDING_VERSION.current) return true;

  const config = metadata.provider === 'cloud'
    ? EMBEDDING_VERSION.cloud
    : EMBEDDING_VERSION.local;

  if (metadata.model !== config.model) return true;

  return false;
}

// =============================================================================
// PIPELINE STATUS
// =============================================================================

/**
 * Get overall pipeline status
 */
export async function getPipelineStatus() {
  const status = {
    stages: {},
    metrics: getStageMetrics(),
    embeddingVersion: EMBEDDING_VERSION,
  };

  for (const stage of STAGE_ORDER) {
    const queue = getPipelineQueue(stage);
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    status.stages[stage] = {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  return status;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  PipelineStage,
  STAGE_ORDER,
  generateIdempotencyKey,
  isAlreadyProcessed,
  markAsProcessed,
  recordStageMetrics,
  getStageMetrics,
  resetStageMetrics,
  getPipelineQueue,
  addToPipeline,
  moveToNextStage,
  EMBEDDING_VERSION,
  createEmbeddingMetadata,
  needsEmbeddingMigration,
  getPipelineStatus,
};

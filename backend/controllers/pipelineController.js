import { catchAsync } from '../utils/core/errorHandler.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';
import logger from '../config/logger.js';
import {
  getPipelineStatus,
  getStageMetrics,
  resetStageMetrics,
  getPipelineHealthStatus,
  retryFailedJobs,
  drainStageQueue,
  STAGE_ORDER,
  EMBEDDING_VERSION,
} from '../services/pipeline/index.js';
import {
  getMigrationStatus,
  getDocumentsNeedingMigration,
  startMigration,
  cancelMigration,
} from '../services/pipeline/embeddingMigration.js';

/**
 * Phase 3: Pipeline Controller
 *
 * API endpoints for pipeline monitoring, metrics, and migration.
 */

// =============================================================================
// PIPELINE STATUS ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/v1/pipeline/status:
 *   get:
 *     summary: Get pipeline status
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline status retrieved successfully
 */
export const getPipelineStatusEndpoint = catchAsync(async (req, res) => {
  const status = await getPipelineStatus();

  sendSuccess(res, {
    pipeline: status,
    stageOrder: STAGE_ORDER,
    embeddingVersion: EMBEDDING_VERSION,
  });
});

/**
 * @swagger
 * /api/v1/pipeline/health:
 *   get:
 *     summary: Get pipeline health status
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline health status retrieved successfully
 */
export const getPipelineHealth = catchAsync(async (req, res) => {
  const health = await getPipelineHealthStatus();

  const statusCode = health.healthy ? 200 : 503;
  res.status(statusCode).json({
    success: health.healthy,
    data: health,
  });
});

// =============================================================================
// METRICS ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/v1/pipeline/metrics:
 *   get:
 *     summary: Get per-stage metrics
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *         description: Specific stage to get metrics for
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 */
export const getMetrics = catchAsync(async (req, res) => {
  const { stage } = req.query;

  // Validate stage if provided
  if (stage && !STAGE_ORDER.includes(stage)) {
    return sendError(res, `Invalid stage. Valid stages: ${STAGE_ORDER.join(', ')}`, 400);
  }

  const metrics = getStageMetrics(stage);

  // Calculate aggregated metrics
  const aggregated = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgTimeMs: 0,
    totalItemsProcessed: 0,
  };

  Object.values(metrics).forEach((m) => {
    aggregated.totalJobs += m.totalJobs;
    aggregated.completedJobs += m.completedJobs;
    aggregated.failedJobs += m.failedJobs;
    aggregated.totalItemsProcessed += m.itemsProcessed;
  });

  if (aggregated.totalJobs > 0) {
    const totalAvgTime = Object.values(metrics).reduce(
      (sum, m) => sum + m.avgTimeMs * m.totalJobs,
      0
    );
    aggregated.avgTimeMs = Math.round(totalAvgTime / aggregated.totalJobs);
  }

  aggregated.successRate =
    aggregated.totalJobs > 0
      ? Math.round((aggregated.completedJobs / aggregated.totalJobs) * 100)
      : 100;

  sendSuccess(res, {
    metrics: stage ? metrics : metrics,
    aggregated: stage ? null : aggregated,
    stages: STAGE_ORDER,
  });
});

/**
 * @swagger
 * /api/v1/pipeline/metrics:
 *   delete:
 *     summary: Reset metrics
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *         description: Specific stage to reset metrics for (omit for all)
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 */
export const resetMetrics = catchAsync(async (req, res) => {
  const { stage } = req.query;

  if (stage && !STAGE_ORDER.includes(stage)) {
    return sendError(res, `Invalid stage. Valid stages: ${STAGE_ORDER.join(', ')}`, 400);
  }

  resetStageMetrics(stage);

  logger.info('Pipeline metrics reset', {
    service: 'pipeline-api',
    stage: stage || 'all',
    userId: req.user?._id,
  });

  sendSuccess(res, {
    message: stage ? `Metrics reset for stage: ${stage}` : 'All metrics reset',
  });
});

// =============================================================================
// QUEUE MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/v1/pipeline/stages/{stage}/retry:
 *   post:
 *     summary: Retry failed jobs in a stage
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stage
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Failed jobs retried
 */
export const retryStageFailedJobs = catchAsync(async (req, res) => {
  const { stage } = req.params;
  const { limit = 100 } = req.query;

  if (!STAGE_ORDER.includes(stage)) {
    return sendError(res, `Invalid stage. Valid stages: ${STAGE_ORDER.join(', ')}`, 400);
  }

  const retriedCount = await retryFailedJobs(stage, parseInt(limit));

  logger.info('Retried failed pipeline jobs', {
    service: 'pipeline-api',
    stage,
    retriedCount,
    userId: req.user?._id,
  });

  sendSuccess(res, {
    stage,
    retriedCount,
    message: `Retried ${retriedCount} failed jobs`,
  });
});

/**
 * @swagger
 * /api/v1/pipeline/stages/{stage}/drain:
 *   post:
 *     summary: Drain a stage queue (remove waiting jobs)
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stage
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue drained
 */
export const drainStage = catchAsync(async (req, res) => {
  const { stage } = req.params;

  if (!STAGE_ORDER.includes(stage)) {
    return sendError(res, `Invalid stage. Valid stages: ${STAGE_ORDER.join(', ')}`, 400);
  }

  await drainStageQueue(stage);

  logger.warn('Pipeline queue drained', {
    service: 'pipeline-api',
    stage,
    userId: req.user?._id,
  });

  sendSuccess(res, {
    stage,
    message: `Queue drained for stage: ${stage}`,
  });
});

// =============================================================================
// MIGRATION ENDPOINTS
// =============================================================================

/**
 * @swagger
 * /api/v1/pipeline/migration/status:
 *   get:
 *     summary: Get migration status
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration status retrieved
 */
export const getMigrationStatusEndpoint = catchAsync(async (req, res) => {
  const status = getMigrationStatus();

  sendSuccess(res, {
    migration: status,
    currentVersion: EMBEDDING_VERSION.current,
    embeddingConfig: EMBEDDING_VERSION,
  });
});

/**
 * @swagger
 * /api/v1/pipeline/migration/check/{workspaceId}:
 *   get:
 *     summary: Check documents needing migration
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 1000
 *     responses:
 *       200:
 *         description: Migration check results
 */
export const checkMigrationNeeded = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const { limit = 1000 } = req.query;

  const result = await getDocumentsNeedingMigration(workspaceId, parseInt(limit));

  sendSuccess(res, {
    workspaceId,
    ...result,
    currentVersion: EMBEDDING_VERSION.current,
  });
});

/**
 * @swagger
 * /api/v1/pipeline/migration/start/{workspaceId}:
 *   post:
 *     summary: Start embedding migration
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               batchSize:
 *                 type: integer
 *                 default: 10
 *               priority:
 *                 type: string
 *                 enum: [high, normal, low]
 *                 default: normal
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Migration started
 */
export const startMigrationEndpoint = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const { batchSize = 10, priority = 'normal', dryRun = false } = req.body;

  const result = await startMigration(workspaceId, {
    batchSize,
    priority,
    dryRun,
  });

  logger.info('Migration started via API', {
    service: 'pipeline-api',
    workspaceId,
    dryRun,
    userId: req.user?._id,
  });

  sendSuccess(res, result);
});

/**
 * @swagger
 * /api/v1/pipeline/migration/cancel:
 *   post:
 *     summary: Cancel ongoing migration
 *     tags: [Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration cancelled
 */
export const cancelMigrationEndpoint = catchAsync(async (req, res) => {
  const result = await cancelMigration();

  logger.warn('Migration cancelled via API', {
    service: 'pipeline-api',
    userId: req.user?._id,
  });

  sendSuccess(res, result);
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getPipelineStatusEndpoint,
  getPipelineHealth,
  getMetrics,
  resetMetrics,
  retryStageFailedJobs,
  drainStage,
  getMigrationStatusEndpoint,
  checkMigrationNeeded,
  startMigrationEndpoint,
  cancelMigrationEndpoint,
};

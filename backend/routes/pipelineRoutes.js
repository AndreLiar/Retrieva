import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
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
} from '../controllers/pipelineController.js';

/**
 * Phase 3: Pipeline Routes
 *
 * API routes for pipeline monitoring, metrics, and embedding migration.
 */

const router = Router();

// =============================================================================
// PIPELINE STATUS
// =============================================================================

/**
 * @route GET /api/v1/pipeline/status
 * @desc Get overall pipeline status
 * @access Private
 */
router.get('/status', authenticate, getPipelineStatusEndpoint);

/**
 * @route GET /api/v1/pipeline/health
 * @desc Get pipeline health status
 * @access Private
 */
router.get('/health', authenticate, getPipelineHealth);

// =============================================================================
// METRICS
// =============================================================================

/**
 * @route GET /api/v1/pipeline/metrics
 * @desc Get per-stage metrics
 * @access Private
 */
router.get('/metrics', authenticate, getMetrics);

/**
 * @route DELETE /api/v1/pipeline/metrics
 * @desc Reset metrics
 * @access Private (Admin)
 */
router.delete('/metrics', authenticate, authorize('admin'), resetMetrics);

// =============================================================================
// QUEUE MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/pipeline/stages/:stage/retry
 * @desc Retry failed jobs in a stage
 * @access Private (Admin)
 */
router.post('/stages/:stage/retry', authenticate, authorize('admin'), retryStageFailedJobs);

/**
 * @route POST /api/v1/pipeline/stages/:stage/drain
 * @desc Drain a stage queue
 * @access Private (Admin)
 */
router.post('/stages/:stage/drain', authenticate, authorize('admin'), drainStage);

// =============================================================================
// EMBEDDING MIGRATION
// =============================================================================

/**
 * @route GET /api/v1/pipeline/migration/status
 * @desc Get current migration status
 * @access Private
 */
router.get('/migration/status', authenticate, getMigrationStatusEndpoint);

/**
 * @route GET /api/v1/pipeline/migration/check/:workspaceId
 * @desc Check which documents need migration
 * @access Private
 */
router.get('/migration/check/:workspaceId', authenticate, checkMigrationNeeded);

/**
 * @route POST /api/v1/pipeline/migration/start/:workspaceId
 * @desc Start embedding migration for a workspace
 * @access Private (Admin)
 */
router.post('/migration/start/:workspaceId', authenticate, authorize('admin'), startMigrationEndpoint);

/**
 * @route POST /api/v1/pipeline/migration/cancel
 * @desc Cancel ongoing migration
 * @access Private (Admin)
 */
router.post('/migration/cancel', authenticate, authorize('admin'), cancelMigrationEndpoint);

export default router;

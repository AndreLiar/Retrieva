/**
 * Phase 3: Pipeline Architecture
 *
 * Unified exports for the document processing pipeline.
 */

// Pipeline stages and utilities
export {
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
} from './pipelineStages.js';

// Stage handlers
export { stageHandlers } from './stageHandlers.js';

// Pipeline orchestrator
export {
  startPipeline,
  startPipelineFromStage,
  initializePipelineWorkers,
  stopPipelineWorkers,
  getPipelineHealthStatus,
  drainStageQueue,
  retryFailedJobs,
} from './pipelineOrchestrator.js';

// Embedding migration
export {
  getMigrationStatus,
  getDocumentsNeedingMigration,
  startMigration,
  cancelMigration,
  initializeMigrationWorker,
  stopMigrationWorker,
} from './embeddingMigration.js';

// Pipeline adapter (for gradual migration)
export {
  queueDocumentForIndexing,
  batchQueueDocuments,
  isPipelineEnabled,
  getIndexingMode,
} from './pipelineAdapter.js';

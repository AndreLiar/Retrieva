/**
 * Phase 3: Pipeline Adapter
 *
 * Provides a unified interface for document indexing that can use
 * either the legacy worker queue or the new pipeline architecture.
 *
 * The adapter allows gradual migration from legacy to pipeline
 * without breaking existing integrations.
 */

import { documentIndexQueue } from '../../config/queue.js';
import { startPipeline } from './pipelineOrchestrator.js';
import logger from '../../config/logger.js';

// Feature flag for pipeline usage
const USE_PIPELINE = process.env.USE_PIPELINE === 'true';

/**
 * Queue a document for indexing
 * Routes to either legacy worker or new pipeline based on configuration
 *
 * @param {Object} params - Document indexing parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.sourceId - Document source ID
 * @param {Object} params.documentContent - Document content and metadata
 * @param {string} params.operation - 'add', 'update', or 'delete'
 * @param {boolean} [params.skipM3] - Skip M3 memory processing
 * @param {boolean} [params.usePipeline] - Override pipeline usage
 * @returns {Promise<Object>} Job object
 */
export async function queueDocumentForIndexing(params) {
  const {
    workspaceId,
    sourceId,
    documentContent,
    operation = 'add',
    skipM3 = false,
    usePipeline = USE_PIPELINE,
  } = params;

  // For delete operations, always use legacy (pipeline doesn't handle deletes yet)
  if (operation === 'delete') {
    return queueLegacyIndexing(params);
  }

  if (usePipeline) {
    logger.debug('Queueing document for pipeline processing', {
      service: 'pipeline-adapter',
      workspaceId,
      sourceId,
      operation,
    });

    return startPipeline({
      workspaceId,
      sourceId,
      documentContent,
      operation,
      skipM3,
    });
  } else {
    return queueLegacyIndexing(params);
  }
}

/**
 * Queue document using legacy worker
 */
async function queueLegacyIndexing(params) {
  const {
    workspaceId,
    sourceId,
    documentContent,
    operation,
    vectorStoreIds,
    skipM3,
  } = params;

  logger.debug('Queueing document for legacy indexing', {
    service: 'pipeline-adapter',
    workspaceId,
    sourceId,
    operation,
  });

  return documentIndexQueue.add('index', {
    workspaceId,
    sourceId,
    documentContent,
    operation,
    vectorStoreIds,
    skipM3,
  });
}

/**
 * Batch queue multiple documents
 *
 * @param {Array<Object>} documents - Array of document params
 * @param {Object} [options] - Batch options
 * @param {boolean} [options.usePipeline] - Use pipeline for all
 * @returns {Promise<Array<Object>>} Array of job objects
 */
export async function batchQueueDocuments(documents, options = {}) {
  const { usePipeline = USE_PIPELINE } = options;

  const jobs = await Promise.all(
    documents.map((doc) =>
      queueDocumentForIndexing({
        ...doc,
        usePipeline,
      })
    )
  );

  logger.info('Batch queued documents for indexing', {
    service: 'pipeline-adapter',
    count: documents.length,
    usePipeline,
  });

  return jobs;
}

/**
 * Check if pipeline mode is enabled
 */
export function isPipelineEnabled() {
  return USE_PIPELINE;
}

/**
 * Get pipeline/legacy status
 */
export function getIndexingMode() {
  return {
    mode: USE_PIPELINE ? 'pipeline' : 'legacy',
    pipelineEnabled: USE_PIPELINE,
    features: USE_PIPELINE
      ? ['staged_processing', 'per_stage_metrics', 'idempotency', 'embedding_migration']
      : ['monolithic_processing'],
  };
}

export default {
  queueDocumentForIndexing,
  batchQueueDocuments,
  isPipelineEnabled,
  getIndexingMode,
};

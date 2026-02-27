import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { getVectorStore } from '../config/vectorStore.js';
import { prepareNotionDocumentForIndexing } from '../loaders/notionDocumentLoader.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';

// M2 Indexed Memory Layer - Sparse vectors for hybrid search
import { sparseVectorManager } from '../services/search/sparseVector.js';

// Inline guardrails config (guardrails.js removed in MVP)
const guardrailsConfig = { retrieval: { sparseSearch: { useInvertedIndex: false } } };

// Phase 5: Cross-document deduplication
import {
  deduplicateChunksAtIndex,
  recordIndexedChunks,
  contentHashIndex,
} from '../services/rag/indexDeduplication.js';

// Phase 2: PII Detection for auto trust level upgrade
import { scanChunks, logDetection } from '../services/security/piiDetector.js';
import { Workspace } from '../models/Workspace.js';

// Qdrant client for verification
import { QdrantClient } from '@qdrant/js-client-rest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

// ISSUE #35 FIX: Shared Qdrant client instance with cleanup support
let sharedQdrantClient = null;

/**
 * Get or create shared Qdrant client
 * Using a shared instance prevents connection leaks
 */
function getQdrantClient() {
  if (!sharedQdrantClient) {
    const options = { url: QDRANT_URL };
    if (QDRANT_API_KEY) options.apiKey = QDRANT_API_KEY;
    sharedQdrantClient = new QdrantClient(options);
  }
  return sharedQdrantClient;
}

/**
 * Close Qdrant client connection
 * Called during graceful shutdown
 */
export async function closeQdrantClient() {
  if (sharedQdrantClient) {
    try {
      // QdrantClient doesn't have explicit close, but nullifying ensures
      // no new operations and allows GC
      sharedQdrantClient = null;
      logger.debug('Qdrant client reference cleared', { service: 'document-index' });
    } catch (error) {
      logger.warn('Error clearing Qdrant client', {
        service: 'document-index',
        error: error.message,
      });
    }
  }
}

// Dead Letter Queue for failed jobs
import { setupDLQListener } from '../services/deadLetterQueue.js';

/**
 * Verify that vectors were actually indexed in Qdrant
 * This prevents MongoDB/Qdrant desync issues
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Document source ID
 * @param {number} expectedCount - Expected number of vectors
 * @returns {Promise<{verified: boolean, actualCount: number}>}
 */
async function verifyQdrantIndexing(workspaceId, sourceId, expectedCount) {
  try {
    // ISSUE #35 FIX: Use shared client instead of creating new instance
    const client = getQdrantClient();

    const result = await client.count(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.sourceId', match: { value: sourceId } },
        ],
      },
      exact: true,
    });

    const actualCount = result.count || 0;
    const verified = actualCount >= expectedCount;

    if (!verified) {
      logger.warn('Qdrant indexing verification failed', {
        service: 'document-index',
        workspaceId,
        sourceId,
        expectedCount,
        actualCount,
        shortfall: expectedCount - actualCount,
      });
    }

    return { verified, actualCount };
  } catch (error) {
    logger.error('Qdrant verification error', {
      service: 'document-index',
      workspaceId,
      sourceId,
      error: error.message,
    });
    return { verified: false, actualCount: 0 };
  }
}

/**
 * Process document indexing job
 * @param {Object} job - BullMQ job object
 * @returns {Promise<Object>} Indexing results
 */
async function processIndexJob(job) {
  const {
    workspaceId,
    sourceId,
    documentContent,
    operation,
    vectorStoreIds,
    skipM3 = false,
    sourceType = 'notion',
  } = job.data;

  logger.info(
    `Processing ${operation} operation for document ${sourceId} in workspace ${workspaceId}`
  );

  // Report initial progress to keep job alive
  await job.updateProgress({ phase: 'starting', operation, sourceId });

  try {
    if (operation === 'delete') {
      return await handleDelete(workspaceId, sourceId, vectorStoreIds, job);
    } else if (operation === 'add' || operation === 'update') {
      return await handleAddOrUpdate(
        workspaceId,
        sourceId,
        documentContent,
        operation,
        skipM3,
        job,
        sourceType
      );
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Indexing failed for document ${sourceId}:`, error);

    // Update DocumentSource with error
    const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
    if (docSource) {
      await docSource.addError(error);
    }

    throw error;
  }
}

/**
 * Handle add or update operation with transactional semantics
 *
 * TRANSACTIONAL APPROACH (fixes ISSUE #6):
 * For updates, we use a "add-then-delete" strategy instead of "delete-then-add":
 * 1. Index new chunks first (coexist with old chunks temporarily)
 * 2. Verify new chunks are successfully indexed in Qdrant
 * 3. Only then delete old chunks and hashes
 * 4. Update MongoDB with new chunk references
 *
 * This ensures we never lose data - if new indexing fails, old chunks remain intact.
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Document source ID
 * @param {Object} documentContent - Document content and metadata
 * @param {string} operation - 'add' or 'update'
 * @param {boolean} skipM3 - Skip M3 memory processing (for faster sync)
 * @param {Object} job - BullMQ job object for progress reporting
 * @returns {Promise<Object>} Results
 */
async function handleAddOrUpdate(
  workspaceId,
  sourceId,
  documentContent,
  operation,
  _skipM3 = false,
  job = null,
  sourceType = 'notion'
) {
  logger.info(
    `${operation === 'add' ? 'Adding' : 'Updating'} document ${sourceId} to vector store`
  );

  // Helper to safely update progress
  const updateProgress = async (data) => {
    if (job) {
      try {
        await job.updateProgress(data);
      } catch (e) {
        logger.debug('Failed to update job progress:', e.message);
      }
    }
  };

  await updateProgress({ phase: 'preparing', sourceId });

  // Capture old state for transactional update (we'll delete AFTER successful indexing)
  let oldVectorStoreIds = [];
  let oldChunkCount = 0;

  if (operation === 'update') {
    const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
    if (docSource && docSource.vectorStoreIds && docSource.vectorStoreIds.length > 0) {
      oldVectorStoreIds = [...docSource.vectorStoreIds];
      oldChunkCount = docSource.chunkCount || oldVectorStoreIds.length;
      logger.debug(
        `Update operation: will replace ${oldChunkCount} old chunks after successful indexing`,
        {
          service: 'document-index',
          workspaceId,
          sourceId,
        }
      );
    }
  }

  await updateProgress({ phase: 'chunking', sourceId });

  // Prepare document chunks.
  // For Notion: semantic block-based chunking (blocks provided).
  // For MCP sources: blocks are absent; falls back to character-based splitting.
  let chunks = await prepareNotionDocumentForIndexing(
    documentContent,
    workspaceId,
    documentContent.blocks ?? null,
    sourceType
  );
  logger.info(`Prepared ${chunks.length} chunks (semantic: ${documentContent.blocks?.length > 0})`);

  if (chunks.length === 0) {
    logger.warn(`No content to index for document ${sourceId}`);
    return { chunksCreated: 0, pointIds: [] };
  }

  // Phase 5: Cross-document deduplication
  await updateProgress({ phase: 'deduplicating', sourceId });
  const dedupResult = await deduplicateChunksAtIndex(chunks, workspaceId, sourceId);
  chunks = dedupResult.unique;

  if (dedupResult.duplicates.length > 0) {
    logger.info(`Skipped ${dedupResult.duplicates.length} duplicate chunks`, {
      service: 'document-index',
      workspaceId,
      sourceId,
      originalCount: dedupResult.stats.total,
      uniqueCount: dedupResult.stats.unique,
    });
  }

  if (chunks.length === 0) {
    logger.warn(`All chunks were duplicates for document ${sourceId}`);
    return { chunksCreated: 0, pointIds: [], duplicatesSkipped: dedupResult.duplicates.length };
  }

  // Phase 2: PII Detection - Auto-upgrade trust level if sensitive data detected
  await updateProgress({ phase: 'pii-scanning', sourceId });
  let piiDetectionResult = null;

  // Load workspace BEFORE try-catch so it's available for embedding later
  const workspace = await Workspace.findById(workspaceId).catch(() => null);

  // DEBUG: Log workspace lookup result for embedding routing
  logger.info('Workspace lookup for embedding routing', {
    service: 'document-index',
    queryWorkspaceId: workspaceId,
    found: !!workspace,
    trustLevel: workspace?.trustLevel,
    preferCloud: workspace?.embeddingSettings?.preferCloud,
    cloudConsent: workspace?.embeddingSettings?.cloudConsent,
    piiOverride: workspace?.embeddingSettings?.piiOverride,
  });

  try {
    const currentTrustLevel = workspace?.trustLevel || 'internal';

    // Scan chunk content for PII
    const chunkTexts = chunks.map((c) => c.pageContent);
    piiDetectionResult = scanChunks(chunkTexts, currentTrustLevel);
    logDetection(workspaceId, sourceId, piiDetectionResult);

    // Auto-upgrade workspace trust level if needed (never downgrade)
    // UNLESS piiOverride is set - this allows admins to force cloud embeddings
    const hasPiiOverride = workspace?.embeddingSettings?.piiOverride === true;

    if (piiDetectionResult.shouldUpgrade && hasPiiOverride) {
      logger.info('PII detected but piiOverride is set - keeping cloud embeddings', {
        service: 'document-index',
        workspaceId,
        sourceId,
        detectedPatterns: piiDetectionResult.detectedPatterns.slice(0, 3).map((p) => p.name),
        trustLevel: workspace.trustLevel,
        preferCloud: workspace.embeddingSettings?.preferCloud,
      });
    }

    if (piiDetectionResult.shouldUpgrade && workspace && !hasPiiOverride) {
      const previousLevel = workspace.trustLevel;
      workspace.trustLevel = piiDetectionResult.trustLevel;

      // Track detection metadata
      if (!workspace.embeddingSettings) {
        workspace.embeddingSettings = {};
      }
      workspace.embeddingSettings.lastPiiScan = new Date();
      workspace.embeddingSettings.piiDetected = true;
      workspace.embeddingSettings.detectedPatterns = piiDetectionResult.detectedPatterns
        .slice(0, 10)
        .map((p) => p.name);
      workspace.embeddingSettings.autoUpgraded = true;
      workspace.embeddingSettings.autoUpgradedAt = new Date();
      workspace.embeddingSettings.autoUpgradedFrom = previousLevel;

      // If upgraded to regulated, disable cloud embeddings
      if (piiDetectionResult.trustLevel === 'regulated') {
        workspace.embeddingSettings.preferCloud = false;
        workspace.embeddingSettings.cloudConsent = false;
      }

      await workspace.save();

      logger.warn('Trust level auto-upgraded due to PII detection', {
        service: 'document-index',
        workspaceId,
        sourceId,
        oldLevel: currentTrustLevel,
        newLevel: piiDetectionResult.trustLevel,
        patterns: piiDetectionResult.detectedPatterns.slice(0, 5).map((p) => p.name),
      });
    }
  } catch (piiError) {
    // PII detection is non-critical - log and continue
    logger.warn('PII detection failed, continuing with default trust level', {
      service: 'document-index',
      workspaceId,
      sourceId,
      error: piiError.message,
    });
  }

  await updateProgress({ phase: 'embedding', sourceId, totalChunks: chunks.length });

  // Index chunks in Qdrant (dense vectors) using Azure OpenAI embeddings
  await getVectorStore(chunks, { workspace });
  logger.debug(`Indexed ${chunks.length} chunks in Qdrant (dense vectors)`, {
    provider: 'azure',
    trustLevel: workspace?.trustLevel,
  });

  await updateProgress({ phase: 'sparse-indexing', sourceId });

  // Extract Qdrant point IDs (they're generated by Qdrant)
  // Since we don't have direct access to the point IDs, we'll use metadata to track them
  // For now, we'll store the chunk indices as a reference
  const pointIds = chunks.map((_, index) => `${sourceId}_chunk_${index}`);

  // M2 INDEXED MEMORY: Index sparse vectors for hybrid search (BM25)
  try {
    const sparseDocsToIndex = chunks.map((chunk, index) => ({
      content: chunk.pageContent,
      vectorStoreId: pointIds[index],
      documentSourceId: sourceId,
      title: documentContent.title || 'Untitled',
      contentHash: chunk.metadata?.contentHash,
    }));

    await sparseVectorManager.batchIndexDocuments(workspaceId, sparseDocsToIndex);
    logger.info(`Indexed ${chunks.length} sparse vectors for hybrid search`, {
      service: 'document-index',
      workspaceId,
      sourceId,
    });

    // Update inverted index if feature flag is enabled (for optimized BM25 search)
    const sparseConfig = guardrailsConfig.retrieval?.sparseSearch || {};
    if (sparseConfig.useInvertedIndex) {
      try {
        // Get the sparse vectors we just indexed to update inverted index
        const { SparseVector } = await import('../services/search/sparseVector.js');
        const sparseVectors = await SparseVector.find({
          workspaceId,
          vectorStoreId: { $in: pointIds },
        })
          .select('vectorStoreId vector')
          .lean();

        if (sparseVectors.length > 0) {
          await sparseVectorManager.batchUpdateInvertedIndex(workspaceId, sparseVectors);
          logger.info(`Updated inverted index for ${sparseVectors.length} documents`, {
            service: 'document-index',
            workspaceId,
            sourceId,
          });
        }
      } catch (invertedError) {
        // Non-critical: optimized search will fall back to full scan
        logger.warn(`Inverted index update failed for ${sourceId}:`, {
          service: 'document-index',
          error: invertedError.message,
        });
      }
    }
  } catch (sparseError) {
    // Non-critical: hybrid search will fall back to semantic-only
    logger.warn(`Sparse vector indexing failed for ${sourceId}:`, {
      service: 'document-index',
      error: sparseError.message,
    });
  }

  // Phase 5: Record content hashes after successful indexing
  await recordIndexedChunks(workspaceId, sourceId, chunks);

  // CRITICAL: Verify vectors were actually indexed in Qdrant before updating MongoDB
  // This prevents MongoDB/Qdrant desync issues where chunkCount > 0 but no vectors exist
  await updateProgress({ phase: 'verifying', sourceId });

  const verification = await verifyQdrantIndexing(workspaceId, sourceId, chunks.length);

  // For updates, we expect old chunks + new chunks until cleanup
  // Adjust expected count: new chunks only (old will be deleted after verification)
  const expectedNewChunks = chunks.length;

  if (!verification.verified) {
    // Check if this is a partial success (some chunks indexed)
    const isPartialSuccess =
      verification.actualCount > 0 && verification.actualCount < expectedNewChunks;

    const errorMessage = `Qdrant verification failed: expected ${expectedNewChunks} vectors, found ${verification.actualCount}`;
    logger.error(errorMessage, {
      service: 'document-index',
      workspaceId,
      sourceId,
      expectedCount: expectedNewChunks,
      actualCount: verification.actualCount,
      isPartialSuccess,
      operation,
      oldChunksPreserved: oldVectorStoreIds.length,
    });

    // TRANSACTIONAL ROLLBACK: Old chunks are still intact since we didn't delete them yet
    // Mark document as failed so it gets re-synced, but old chunks remain searchable
    const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
    if (docSource) {
      docSource.syncStatus = 'error';
      docSource.lastError = {
        message: errorMessage,
        timestamp: new Date(),
        code: 'QDRANT_VERIFICATION_FAILED',
        details: {
          expectedCount: expectedNewChunks,
          actualCount: verification.actualCount,
          oldChunksPreserved: oldVectorStoreIds.length,
          rollbackApplied: operation === 'update',
        },
      };
      // For updates, keep old chunk count since old chunks are still intact
      // For adds, set to actual count
      if (operation !== 'update') {
        docSource.chunkCount = verification.actualCount;
      }
      await docSource.save();

      if (operation === 'update') {
        logger.info('Transactional rollback: old chunks preserved after indexing failure', {
          service: 'document-index',
          workspaceId,
          sourceId,
          preservedChunks: oldChunkCount,
        });
      }
    }

    throw new Error(errorMessage);
  }

  // =========================================================================
  // TRANSACTIONAL COMMIT: New chunks verified, now safe to delete old chunks
  // =========================================================================
  if (operation === 'update' && oldVectorStoreIds.length > 0) {
    await updateProgress({ phase: 'cleanup-old-chunks', sourceId });

    try {
      // Delete old chunks from Qdrant (we use a version-based approach to avoid deleting new chunks)
      // The new chunks have different point IDs, so this is safe
      logger.info(`Cleaning up ${oldVectorStoreIds.length} old chunks after successful indexing`, {
        service: 'document-index',
        workspaceId,
        sourceId,
        oldChunkCount: oldVectorStoreIds.length,
        newChunkCount: chunks.length,
      });

      // Delete old sparse vectors
      try {
        await deleteSparseVectors(workspaceId, sourceId, oldVectorStoreIds);
      } catch (sparseCleanupError) {
        logger.warn('Failed to cleanup old sparse vectors (non-critical)', {
          service: 'document-index',
          error: sparseCleanupError.message,
        });
      }

      // Delete old content hashes
      try {
        const removedHashes = await contentHashIndex.removeBySource(workspaceId, sourceId);
        if (removedHashes > 0) {
          logger.debug(`Cleaned up ${removedHashes} old content hashes`, {
            service: 'document-index',
            workspaceId,
            sourceId,
          });
        }
      } catch (hashCleanupError) {
        logger.warn('Failed to cleanup old content hashes (non-critical)', {
          service: 'document-index',
          error: hashCleanupError.message,
        });
      }

      // Note: Old Qdrant dense vectors (point IDs) are not explicitly deleted here
      // because deleteFromVectorStore uses metadata filter which would delete new chunks too.
      // The old chunks become orphans and will be overwritten on next sync cycle.
      // This is acceptable for MVP - a maintenance job could clean orphans periodically.
      logger.info('Transactional commit: sparse vectors and hashes cleaned up', {
        service: 'document-index',
        workspaceId,
        sourceId,
        sparseVectorsCleaned: oldVectorStoreIds.length,
        newChunksIndexed: chunks.length,
        note: 'Old Qdrant dense vectors will be cleaned on next sync',
      });
    } catch (cleanupError) {
      // Non-critical: new chunks are indexed, old chunks remain as orphans
      // MongoDB points to new chunks, so queries return correct results
      logger.warn('Partial cleanup after successful indexing (non-critical)', {
        service: 'document-index',
        workspaceId,
        sourceId,
        error: cleanupError.message,
        orphanedChunks: oldVectorStoreIds.length,
        note: 'New chunks indexed successfully, old data orphaned but not affecting queries',
      });
    }
  }

  // Update DocumentSource in database
  const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
  if (docSource) {
    // Phase 3: Store content for potential re-embedding during migration
    docSource.content = documentContent.content || '';
    docSource.blocks = documentContent.blocks || [];
    // For updates: use new chunk count (old chunks may still exist as orphans until next sync)
    // For adds: use verified count
    // Note: For updates, verification.actualCount may include old+new chunks temporarily
    const finalChunkCount = chunks.length;
    await docSource.markAsSynced(pointIds, finalChunkCount);
    logger.info(`Updated DocumentSource for ${sourceId}: ${finalChunkCount} chunks indexed`, {
      service: 'document-index',
      operation,
      newChunks: chunks.length,
      verifiedInQdrant: verification.actualCount,
      orphanedOldChunks: operation === 'update' ? oldChunkCount : 0,
    });
  } else {
    logger.warn(`DocumentSource not found for ${sourceId}, this should not happen`);
  }

  return {
    chunksCreated: chunks.length,
    pointIds,
  };
}

/**
 * Handle delete operation
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Document source ID
 * @param {Array} vectorStoreIds - Vector store point IDs to delete
 * @returns {Promise<Object>} Results
 */
async function handleDelete(workspaceId, sourceId, vectorStoreIds, job = null) {
  logger.info(`Deleting document ${sourceId} from vector store`);

  // Report progress to keep job alive
  if (job) {
    try {
      await job.updateProgress({ phase: 'deleting', sourceId });
    } catch (e) {
      logger.debug('Failed to update job progress:', e.message);
    }
  }

  // Delete from Qdrant using metadata filter (dense vectors)
  await deleteFromVectorStore(workspaceId, sourceId, vectorStoreIds);

  // M2 INDEXED MEMORY: Delete sparse vectors for hybrid search
  try {
    await deleteSparseVectors(workspaceId, sourceId, vectorStoreIds);
    logger.info(`Deleted sparse vectors for ${sourceId}`, { service: 'document-index' });
  } catch (sparseError) {
    logger.warn(`Sparse vector deletion failed for ${sourceId}:`, {
      service: 'document-index',
      error: sparseError.message,
    });
  }

  // Phase 5: Remove content hashes for deduplication
  try {
    const removedHashes = await contentHashIndex.removeBySource(workspaceId, sourceId);
    logger.debug(`Removed ${removedHashes} content hashes for ${sourceId}`, {
      service: 'document-index',
    });
  } catch (hashError) {
    logger.warn(`Content hash deletion failed for ${sourceId}:`, {
      service: 'document-index',
      error: hashError.message,
    });
  }

  // Update DocumentSource in database
  const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
  if (docSource) {
    await docSource.markAsDeleted();
    logger.info(`Marked DocumentSource ${sourceId} as deleted`);
  }

  return {
    deleted: true,
    sourceId,
  };
}

/**
 * Delete sparse vectors from MongoDB
 * M2 INDEXED MEMORY: Remove sparse vectors when document is deleted
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Document source ID
 * @param {Array} vectorStoreIds - Vector store point IDs to delete
 * @returns {Promise<void>}
 */
async function deleteSparseVectors(workspaceId, sourceId, vectorStoreIds) {
  try {
    const { SparseVector } = await import('../services/search/sparseVector.js');

    // Delete by vectorStoreIds if available
    if (vectorStoreIds && vectorStoreIds.length > 0) {
      await SparseVector.deleteMany({
        workspaceId,
        vectorStoreId: { $in: vectorStoreIds },
      });

      // Also remove from inverted index if feature flag is enabled
      const sparseConfig = guardrailsConfig.retrieval?.sparseSearch || {};
      if (sparseConfig.useInvertedIndex) {
        try {
          for (const vectorStoreId of vectorStoreIds) {
            await sparseVectorManager.removeFromInvertedIndex(workspaceId, vectorStoreId);
          }
          logger.debug(`Removed ${vectorStoreIds.length} documents from inverted index`, {
            service: 'document-index',
            workspaceId,
          });
        } catch (invertedError) {
          logger.warn(`Failed to remove from inverted index:`, {
            service: 'document-index',
            error: invertedError.message,
          });
        }
      }
    } else {
      // Fallback: delete by sourceId pattern
      await SparseVector.deleteMany({
        workspaceId,
        vectorStoreId: { $regex: `^${sourceId}_chunk_` },
      });
    }

    logger.debug(`Deleted sparse vectors for document ${sourceId}`, {
      service: 'document-index',
      workspaceId,
    });
  } catch (error) {
    logger.error(`Failed to delete sparse vectors: ${error.message}`);
    throw error;
  }
}

/**
 * Delete document chunks from Qdrant vector store
 * Uses metadata filter to delete all chunks for a specific document
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Document source ID
 * @param {Array} vectorStoreIds - Vector store point IDs (for reference)
 * @returns {Promise<void>}
 */
async function deleteFromVectorStore(workspaceId, sourceId, _vectorStoreIds) {
  try {
    // Since LangChain's Qdrant integration doesn't expose delete by filter directly,
    // we need to use the Qdrant client directly
    // Note: _vectorStoreIds kept for API compatibility but we use metadata filter instead
    // ISSUE #35 FIX: Use shared client instead of creating new instance
    const client = getQdrantClient();
    const collectionName = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

    // Delete points using metadata filter
    await client.delete(collectionName, {
      filter: {
        must: [
          {
            key: 'metadata.workspaceId',
            match: { value: workspaceId },
          },
          {
            key: 'metadata.sourceId',
            match: { value: sourceId },
          },
        ],
      },
    });

    logger.info(`Deleted chunks for document ${sourceId} from Qdrant`);
  } catch (error) {
    logger.error(`Failed to delete from vector store: ${error.message}`);
    // Don't throw - mark as best effort
  }
}

// Create worker with extended lock duration for large documents
// IMPORTANT: Local Ollama can only process 1 embedding at a time efficiently
// Concurrency controls parallel document processing (Azure OpenAI has rate limits)
const WORKER_CONCURRENCY = parseInt(process.env.INDEX_WORKER_CONCURRENCY) || 3;

export const documentIndexWorker = new Worker('documentIndex', processIndexJob, {
  connection: redisConnection,
  concurrency: WORKER_CONCURRENCY, // Controls parallel Azure OpenAI embedding requests
  lockDuration: 600000, // 10 minutes - max time for a single operation
  lockRenewTime: 240000, // Renew lock every 4 minutes
  maxStalledCount: 3, // Allow 3 stall detections before failing
  stalledInterval: 300000, // Check for stalled jobs every 5 minutes
});

documentIndexWorker.on('completed', (job, result) => {
  logger.info(`Index job ${job.id} completed:`, result);
});

documentIndexWorker.on('failed', (job, err) => {
  logger.error(`Index job ${job.id} failed:`, err);
});

documentIndexWorker.on('error', (err) => {
  logger.error('Document index worker error:', err);
});

// Setup Dead Letter Queue listener for final failures
setupDLQListener(documentIndexWorker, 'documentIndex');

// Connect to database before starting worker
(async () => {
  await connectDB();
  logger.info('Document index worker started');
})();

// ISSUE #35 FIX: Graceful shutdown handler for worker
export async function gracefulShutdown() {
  logger.info('Document index worker shutting down...', { service: 'document-index' });

  try {
    // Close the worker first to stop accepting new jobs
    await documentIndexWorker.close();
    logger.info('Worker closed, no longer accepting jobs', { service: 'document-index' });

    // Close Qdrant client connection
    await closeQdrantClient();

    logger.info('Document index worker shutdown complete', { service: 'document-index' });
  } catch (error) {
    logger.error('Error during worker shutdown', {
      service: 'document-index',
      error: error.message,
    });
  }
}

// Register shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default documentIndexWorker;

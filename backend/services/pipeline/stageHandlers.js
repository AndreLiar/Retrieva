import logger from '../../config/logger.js';
import { DocumentSource } from '../../models/DocumentSource.js';
import { NotionWorkspace } from '../../models/NotionWorkspace.js';
import { getVectorStore } from '../../config/vectorStore.js';
import { prepareNotionDocumentForIndexing } from '../../loaders/notionDocumentLoader.js';
import { scanChunks, logDetection } from '../security/piiDetector.js';
import { sparseVectorManager } from '../search/sparseVector.js';
import { createOrUpdateSummary } from '../memory/summarization.js';
import { processDocumentEntities } from '../memory/entityExtraction.js';
import { guardrailsConfig } from '../../config/guardrails.js';
import { emitSyncPageFetched, emitSyncIndexing } from '../realtimeEvents.js';
import {
  PipelineStage,
  recordStageMetrics,
  createEmbeddingMetadata,
} from './pipelineStages.js';

/**
 * Phase 3: Pipeline Stage Handlers
 *
 * Each handler processes a specific stage of the document pipeline:
 * - Receives data from previous stage
 * - Performs its specific operation
 * - Returns data for next stage
 *
 * Benefits:
 * - Isolation: Each stage can fail independently
 * - Metrics: Per-stage timing and success rates
 * - Scalability: Can scale specific stages
 * - Retry: Failed stages can retry without redoing previous work
 */

// =============================================================================
// FETCH STAGE HANDLER
// =============================================================================

/**
 * Fetch document content from source (Notion, file, etc.)
 * This stage retrieves the raw document content
 */
export async function handleFetchStage(data) {
  const startTime = Date.now();
  const { workspaceId, sourceId, documentContent } = data;

  try {
    logger.debug('Pipeline FETCH stage starting', {
      service: 'pipeline',
      stage: PipelineStage.FETCH,
      workspaceId,
      sourceId,
    });

    // For now, documentContent is passed from the sync worker
    // In future, this could fetch from Notion API directly
    if (!documentContent) {
      throw new Error('Document content not provided');
    }

    const result = {
      ...data,
      fetchedAt: new Date().toISOString(),
      contentLength: documentContent.content?.length || 0,
      hasBlocks: !!(documentContent.blocks?.length > 0),
    };

    recordStageMetrics(PipelineStage.FETCH, true, Date.now() - startTime);

    logger.info('Pipeline FETCH stage completed', {
      service: 'pipeline',
      stage: PipelineStage.FETCH,
      workspaceId,
      sourceId,
      contentLength: result.contentLength,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.FETCH, false, Date.now() - startTime, 0, error);
    throw error;
  }
}

// =============================================================================
// CHUNK STAGE HANDLER
// =============================================================================

/**
 * Chunk document content using semantic chunking
 * Splits document into meaningful chunks for embedding
 */
export async function handleChunkStage(data) {
  const startTime = Date.now();
  const { workspaceId, sourceId, documentContent } = data;

  try {
    logger.debug('Pipeline CHUNK stage starting', {
      service: 'pipeline',
      stage: PipelineStage.CHUNK,
      workspaceId,
      sourceId,
    });

    // Prepare document chunks with semantic chunking
    const chunks = await prepareNotionDocumentForIndexing(
      documentContent,
      workspaceId,
      documentContent.blocks
    );

    if (chunks.length === 0) {
      logger.warn('No content to chunk', {
        service: 'pipeline',
        stage: PipelineStage.CHUNK,
        workspaceId,
        sourceId,
      });
    }

    // Extract chunk texts for downstream stages
    const chunkTexts = chunks.map((c) => c.pageContent);

    const result = {
      ...data,
      chunks,
      chunkTexts,
      chunkCount: chunks.length,
      chunkedAt: new Date().toISOString(),
      semanticChunking: documentContent.blocks?.length > 0,
    };

    recordStageMetrics(PipelineStage.CHUNK, true, Date.now() - startTime, chunks.length);

    logger.info('Pipeline CHUNK stage completed', {
      service: 'pipeline',
      stage: PipelineStage.CHUNK,
      workspaceId,
      sourceId,
      chunkCount: chunks.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.CHUNK, false, Date.now() - startTime, 0, error);
    throw error;
  }
}

// =============================================================================
// PII SCAN STAGE HANDLER
// =============================================================================

/**
 * Scan chunks for PII and determine trust level
 * Auto-upgrades workspace trust level if sensitive data detected
 */
export async function handlePiiScanStage(data) {
  const startTime = Date.now();
  const { workspaceId, sourceId, chunkTexts, documentContent } = data;

  try {
    logger.debug('Pipeline PII_SCAN stage starting', {
      service: 'pipeline',
      stage: PipelineStage.PII_SCAN,
      workspaceId,
      sourceId,
      chunkCount: chunkTexts?.length || 0,
    });

    // Get workspace for current trust level
    const workspace = await NotionWorkspace.findOne({ workspaceId });
    const currentTrustLevel = workspace?.trustLevel || 'internal';

    // Scan chunk content for PII
    const piiResult = scanChunks(chunkTexts || [], currentTrustLevel);
    logDetection(workspaceId, sourceId, piiResult);

    // Auto-upgrade workspace trust level if needed
    let trustLevelUpgraded = false;
    if (piiResult.shouldUpgrade && workspace) {
      const previousLevel = workspace.trustLevel;
      workspace.trustLevel = piiResult.trustLevel;

      // Track detection metadata
      if (!workspace.embeddingSettings) {
        workspace.embeddingSettings = {};
      }
      workspace.embeddingSettings.lastPiiScan = new Date();
      workspace.embeddingSettings.piiDetected = true;
      workspace.embeddingSettings.detectedPatterns = piiResult.detectedPatterns
        .slice(0, 10)
        .map((p) => p.name);
      workspace.embeddingSettings.autoUpgraded = true;
      workspace.embeddingSettings.autoUpgradedAt = new Date();
      workspace.embeddingSettings.autoUpgradedFrom = previousLevel;

      // If regulated, disable cloud embeddings
      if (piiResult.trustLevel === 'regulated') {
        workspace.embeddingSettings.preferCloud = false;
        workspace.embeddingSettings.cloudConsent = false;
      }

      await workspace.save();
      trustLevelUpgraded = true;

      logger.warn('Trust level auto-upgraded due to PII detection', {
        service: 'pipeline',
        stage: PipelineStage.PII_SCAN,
        workspaceId,
        sourceId,
        oldLevel: currentTrustLevel,
        newLevel: piiResult.trustLevel,
        patterns: piiResult.detectedPatterns.slice(0, 5).map((p) => p.name),
      });

      // Emit real-time event
      emitSyncPageFetched(workspaceId, {
        pageId: sourceId,
        title: documentContent?.title || 'Untitled',
        status: 'pii_detected',
        trustLevelUpgraded: true,
        newTrustLevel: piiResult.trustLevel,
      });
    }

    const result = {
      ...data,
      piiResult,
      trustLevel: piiResult.trustLevel,
      trustLevelUpgraded,
      piiDetected: piiResult.piiDetected,
      detectedPatterns: piiResult.detectedPatterns.map((p) => p.name),
      scannedAt: new Date().toISOString(),
    };

    recordStageMetrics(
      PipelineStage.PII_SCAN,
      true,
      Date.now() - startTime,
      chunkTexts?.length || 0
    );

    logger.info('Pipeline PII_SCAN stage completed', {
      service: 'pipeline',
      stage: PipelineStage.PII_SCAN,
      workspaceId,
      sourceId,
      piiDetected: piiResult.piiDetected,
      trustLevel: piiResult.trustLevel,
      trustLevelUpgraded,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.PII_SCAN, false, Date.now() - startTime, 0, error);
    // PII scan is non-critical - log warning and continue with default trust level
    logger.warn('PII scan failed, continuing with default trust level', {
      service: 'pipeline',
      stage: PipelineStage.PII_SCAN,
      workspaceId,
      sourceId,
      error: error.message,
    });

    return {
      ...data,
      piiResult: null,
      trustLevel: 'internal',
      trustLevelUpgraded: false,
      piiDetected: false,
      detectedPatterns: [],
      scannedAt: new Date().toISOString(),
      piiScanError: error.message,
    };
  }
}

// =============================================================================
// EMBED STAGE HANDLER
// =============================================================================

/**
 * Generate embeddings for chunks
 * Routes to local (Ollama) or cloud (OpenAI) based on workspace settings
 */
export async function handleEmbedStage(data) {
  const startTime = Date.now();
  const { workspaceId, sourceId, chunks, trustLevel } = data;

  try {
    logger.debug('Pipeline EMBED stage starting', {
      service: 'pipeline',
      stage: PipelineStage.EMBED,
      workspaceId,
      sourceId,
      chunkCount: chunks?.length || 0,
      trustLevel,
    });

    if (!chunks || chunks.length === 0) {
      logger.warn('No chunks to embed', {
        service: 'pipeline',
        stage: PipelineStage.EMBED,
        workspaceId,
        sourceId,
      });
      return {
        ...data,
        pointIds: [],
        embeddedAt: new Date().toISOString(),
        embeddingMetadata: null,
      };
    }

    // Get workspace for embedding preferences (preferCloud, cloudConsent, etc.)
    const workspace = await NotionWorkspace.findOne({ workspaceId });

    // Index chunks in Qdrant with workspace settings for hybrid embedding
    // This routes to local (Ollama) or cloud (OpenAI) based on user preferences
    await getVectorStore(chunks, { workspace });

    // Generate point IDs for tracking
    const pointIds = chunks.map((_, index) => `${sourceId}_chunk_${index}`);

    // Determine which provider was used based on workspace settings
    const preferCloud = workspace?.embeddingSettings?.preferCloud || false;
    const cloudConsent = workspace?.embeddingSettings?.cloudConsent || false;
    const effectiveTrustLevel = workspace?.trustLevel || trustLevel || 'internal';

    // Provider selection logic matches embeddingProvider.js selectProvider()
    let provider = 'local';
    if (effectiveTrustLevel === 'public' && preferCloud) {
      provider = 'cloud';
    } else if (effectiveTrustLevel === 'internal' && cloudConsent && preferCloud) {
      provider = 'cloud';
    }

    const embeddingMetadata = createEmbeddingMetadata(provider, chunks.length, {
      trustLevel: effectiveTrustLevel,
      sourceId,
      preferCloud,
      cloudConsent,
    });

    const result = {
      ...data,
      pointIds,
      embeddedAt: new Date().toISOString(),
      embeddingMetadata,
    };

    recordStageMetrics(PipelineStage.EMBED, true, Date.now() - startTime, chunks.length);

    logger.info('Pipeline EMBED stage completed', {
      service: 'pipeline',
      stage: PipelineStage.EMBED,
      workspaceId,
      sourceId,
      chunkCount: chunks.length,
      provider: embeddingMetadata.provider,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.EMBED, false, Date.now() - startTime, 0, error);
    throw error;
  }
}

// =============================================================================
// INDEX STAGE HANDLER
// =============================================================================

/**
 * Index embeddings in vector store and sparse vectors
 * Updates DocumentSource with indexed chunk information
 */
export async function handleIndexStage(data) {
  const startTime = Date.now();
  const {
    workspaceId,
    sourceId,
    chunks,
    pointIds,
    documentContent,
    embeddingMetadata,
  } = data;

  try {
    logger.debug('Pipeline INDEX stage starting', {
      service: 'pipeline',
      stage: PipelineStage.INDEX,
      workspaceId,
      sourceId,
      chunkCount: chunks?.length || 0,
    });

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
        service: 'pipeline',
        stage: PipelineStage.INDEX,
        workspaceId,
        sourceId,
      });

      // Update inverted index if enabled
      const sparseConfig = guardrailsConfig.retrieval?.sparseSearch || {};
      if (sparseConfig.useInvertedIndex) {
        try {
          const { SparseVector } = await import('../search/sparseVector.js');
          const sparseVectors = await SparseVector.find({
            workspaceId,
            vectorStoreId: { $in: pointIds },
          })
            .select('vectorStoreId vector')
            .lean();

          if (sparseVectors.length > 0) {
            await sparseVectorManager.batchUpdateInvertedIndex(workspaceId, sparseVectors);
          }
        } catch (invertedError) {
          logger.warn('Inverted index update failed', {
            service: 'pipeline',
            stage: PipelineStage.INDEX,
            error: invertedError.message,
          });
        }
      }
    } catch (sparseError) {
      logger.warn('Sparse vector indexing failed', {
        service: 'pipeline',
        stage: PipelineStage.INDEX,
        error: sparseError.message,
      });
    }

    // Update DocumentSource in database
    const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
    if (docSource) {
      await docSource.markAsSynced(pointIds, chunks.length);

      // Store embedding metadata for migration tracking
      if (embeddingMetadata) {
        docSource.embeddingMetadata = embeddingMetadata;
        await docSource.save();
      }

      // Emit real-time events
      emitSyncIndexing(workspaceId, {
        documentsIndexed: 1,
        totalDocuments: 1,
        currentDocument: documentContent.title || sourceId,
      });

      emitSyncPageFetched(workspaceId, {
        pageId: sourceId,
        title: documentContent.title || 'Untitled',
        status: 'success',
        chunksCreated: chunks.length,
      });
    }

    const result = {
      ...data,
      indexed: true,
      indexedAt: new Date().toISOString(),
    };

    recordStageMetrics(PipelineStage.INDEX, true, Date.now() - startTime, chunks.length);

    logger.info('Pipeline INDEX stage completed', {
      service: 'pipeline',
      stage: PipelineStage.INDEX,
      workspaceId,
      sourceId,
      chunkCount: chunks.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.INDEX, false, Date.now() - startTime, 0, error);
    throw error;
  }
}

// =============================================================================
// ENRICH STAGE HANDLER
// =============================================================================

/**
 * Enrich document with M3 memory (summaries, entities)
 * This stage can be skipped for faster sync
 */
export async function handleEnrichStage(data) {
  const startTime = Date.now();
  const { workspaceId, sourceId, documentContent, skipM3 = false } = data;

  try {
    logger.debug('Pipeline ENRICH stage starting', {
      service: 'pipeline',
      stage: PipelineStage.ENRICH,
      workspaceId,
      sourceId,
      skipM3,
    });

    // Skip M3 processing if requested (for bulk sync)
    if (skipM3) {
      logger.debug('Skipping M3 enrichment (skipM3=true)', {
        service: 'pipeline',
        stage: PipelineStage.ENRICH,
        workspaceId,
        sourceId,
      });

      return {
        ...data,
        enriched: false,
        enrichedAt: new Date().toISOString(),
        skippedReason: 'skipM3 flag set',
      };
    }

    const content = documentContent.content || '';
    const title = documentContent.title || 'Untitled';

    // Skip if content too short
    if (content.length < 200) {
      logger.debug('Skipping M3 enrichment - content too short', {
        service: 'pipeline',
        stage: PipelineStage.ENRICH,
        workspaceId,
        sourceId,
        contentLength: content.length,
      });

      return {
        ...data,
        enriched: false,
        enrichedAt: new Date().toISOString(),
        skippedReason: 'content too short',
      };
    }

    // Get DocumentSource ID
    const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
    const documentSourceId = docSource?._id;

    // Generate document summary
    let summary = null;
    try {
      summary = await createOrUpdateSummary({
        workspaceId,
        documentSourceId,
        sourceId,
        title,
        content,
      });
    } catch (sumError) {
      logger.warn('Summary generation failed', {
        service: 'pipeline',
        stage: PipelineStage.ENRICH,
        error: sumError.message,
      });
    }

    // Extract entities
    let entities = [];
    try {
      entities = await processDocumentEntities({
        workspaceId,
        documentSourceId,
        sourceId,
        title,
        content,
      });

      // Link entities to summary
      if (summary && entities.length > 0) {
        summary.entityIds = entities.map((e) => e._id);
        await summary.save();
      }
    } catch (entError) {
      logger.warn('Entity extraction failed', {
        service: 'pipeline',
        stage: PipelineStage.ENRICH,
        error: entError.message,
      });
    }

    const result = {
      ...data,
      enriched: true,
      enrichedAt: new Date().toISOString(),
      summaryLength: summary?.summary?.length || 0,
      entitiesCount: entities.length,
    };

    recordStageMetrics(PipelineStage.ENRICH, true, Date.now() - startTime, 1);

    logger.info('Pipeline ENRICH stage completed', {
      service: 'pipeline',
      stage: PipelineStage.ENRICH,
      workspaceId,
      sourceId,
      summaryLength: result.summaryLength,
      entitiesCount: result.entitiesCount,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    recordStageMetrics(PipelineStage.ENRICH, false, Date.now() - startTime, 0, error);
    // Enrichment is non-critical
    logger.warn('Enrichment failed', {
      service: 'pipeline',
      stage: PipelineStage.ENRICH,
      error: error.message,
    });

    return {
      ...data,
      enriched: false,
      enrichedAt: new Date().toISOString(),
      enrichError: error.message,
    };
  }
}

// =============================================================================
// STAGE HANDLER MAP
// =============================================================================

export const stageHandlers = {
  [PipelineStage.FETCH]: handleFetchStage,
  [PipelineStage.CHUNK]: handleChunkStage,
  [PipelineStage.PII_SCAN]: handlePiiScanStage,
  [PipelineStage.EMBED]: handleEmbedStage,
  [PipelineStage.INDEX]: handleIndexStage,
  [PipelineStage.ENRICH]: handleEnrichStage,
};

export default stageHandlers;

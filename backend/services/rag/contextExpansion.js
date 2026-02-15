/**
 * Context Expansion Module
 *
 * Provides parent/sibling document retrieval to expand context around
 * retrieved chunks. This helps provide better answers by including
 * surrounding context that may contain relevant information.
 *
 * @module services/rag/contextExpansion
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import logger from '../../config/logger.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

// Singleton Qdrant client
let qdrantClient = null;

function getQdrantClient() {
  if (!qdrantClient) {
    const apiKey = process.env.QDRANT_API_KEY;
    qdrantClient = new QdrantClient({ url: QDRANT_URL, ...(apiKey && { apiKey }) });
  }
  return qdrantClient;
}

/**
 * Configuration for context expansion
 */
export const EXPANSION_CONFIG = {
  // Number of sibling chunks to fetch before and after
  siblingWindowSize: parseInt(process.env.SIBLING_WINDOW_SIZE) || 1,
  // Maximum chunks per source document
  maxChunksPerSource: parseInt(process.env.MAX_CHUNKS_PER_SOURCE) || 5,
  // Enable/disable expansion
  enabled: process.env.ENABLE_CONTEXT_EXPANSION !== 'false',
  // Minimum score threshold for expansion
  minScoreForExpansion: parseFloat(process.env.MIN_SCORE_FOR_EXPANSION) || 0.5,
};

/**
 * @typedef {Object} ExpandedChunk
 * @property {string} pageContent - Chunk content
 * @property {Object} metadata - Chunk metadata
 * @property {number} position - Position in document
 * @property {boolean} isOriginal - Whether this is the originally retrieved chunk
 * @property {string} expansionType - 'original' | 'sibling_before' | 'sibling_after' | 'parent'
 */

/**
 * @typedef {Object} ExpansionResult
 * @property {ExpandedChunk[]} chunks - Expanded chunks
 * @property {Object} metrics - Expansion metrics
 */

/**
 * Fetch sibling chunks for a given chunk
 * Retrieves chunks from the same source document that are adjacent in position
 *
 * @param {string} workspaceId - Workspace ID for isolation
 * @param {string} sourceId - Source document ID
 * @param {number} position - Current chunk position (0-based index)
 * @param {number} windowSize - Number of siblings to fetch on each side
 * @returns {Promise<Object[]>} Array of sibling chunk payloads
 */
export async function fetchSiblingChunks(workspaceId, sourceId, position, windowSize = 1) {
  const client = getQdrantClient();

  try {
    // Calculate position range
    const minPosition = Math.max(0, position - windowSize);
    const maxPosition = position + windowSize;

    // Query Qdrant for sibling chunks by position
    const result = await client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.sourceId', match: { value: sourceId } },
        ],
      },
      limit: maxPosition - minPosition + 3, // Extra buffer
      with_payload: true,
      with_vector: false,
    });

    if (!result.points || result.points.length === 0) {
      return [];
    }

    // Filter to siblings within position range
    const siblings = result.points
      .filter((point) => {
        const chunkPosition =
          point.payload?.metadata?.chunkIndex ??
          point.payload?.metadata?.position ??
          extractPositionFromId(point.payload?.metadata?.vectorStoreId);
        return (
          chunkPosition !== null &&
          chunkPosition >= minPosition &&
          chunkPosition <= maxPosition &&
          chunkPosition !== position
        ); // Exclude the original
      })
      .map((point) => ({
        pageContent: point.payload?.pageContent || point.payload?.content || '',
        metadata: point.payload?.metadata || {},
        id: point.id,
      }));

    logger.debug('Fetched sibling chunks', {
      service: 'context-expansion',
      sourceId,
      position,
      siblingsFound: siblings.length,
    });

    return siblings;
  } catch (error) {
    logger.error('Failed to fetch sibling chunks', {
      service: 'context-expansion',
      sourceId,
      position,
      error: error.message,
    });
    return [];
  }
}

/**
 * Extract position from vectorStoreId if stored as sourceId_chunk_N format
 * @param {string} vectorStoreId - Vector store ID
 * @returns {number|null} Position or null
 */
function extractPositionFromId(vectorStoreId) {
  if (!vectorStoreId) return null;
  const match = vectorStoreId.match(/_chunk_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Fetch all chunks from a parent document
 * Useful for small documents where full context is needed
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Source document ID
 * @param {number} limit - Maximum chunks to return
 * @returns {Promise<Object[]>} Array of chunk payloads sorted by position
 */
export async function fetchParentDocumentChunks(workspaceId, sourceId, limit = 10) {
  const client = getQdrantClient();

  try {
    const result = await client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.sourceId', match: { value: sourceId } },
        ],
      },
      limit,
      with_payload: true,
      with_vector: false,
    });

    if (!result.points || result.points.length === 0) {
      return [];
    }

    // Sort by position/chunk index
    const chunks = result.points
      .map((point) => ({
        pageContent: point.payload?.pageContent || point.payload?.content || '',
        metadata: point.payload?.metadata || {},
        position:
          point.payload?.metadata?.chunkIndex ??
          point.payload?.metadata?.position ??
          extractPositionFromId(point.payload?.metadata?.vectorStoreId) ??
          0,
        id: point.id,
      }))
      .sort((a, b) => a.position - b.position);

    logger.debug('Fetched parent document chunks', {
      service: 'context-expansion',
      sourceId,
      chunksFound: chunks.length,
    });

    return chunks;
  } catch (error) {
    logger.error('Failed to fetch parent document chunks', {
      service: 'context-expansion',
      sourceId,
      error: error.message,
    });
    return [];
  }
}

/**
 * Expand context for retrieved documents by fetching siblings
 * This is the main entry point for context expansion
 *
 * @param {Object[]} documents - Retrieved documents with metadata
 * @param {string} workspaceId - Workspace ID for isolation
 * @param {Object} options - Expansion options
 * @returns {Promise<ExpansionResult>} Expanded documents with metrics
 */
export async function expandDocumentContext(documents, workspaceId, options = {}) {
  const {
    windowSize = EXPANSION_CONFIG.siblingWindowSize,
    maxChunksPerSource = EXPANSION_CONFIG.maxChunksPerSource,
    minScore = EXPANSION_CONFIG.minScoreForExpansion,
  } = options;

  if (!EXPANSION_CONFIG.enabled || !documents || documents.length === 0) {
    return {
      chunks: documents.map((doc) => ({
        ...doc,
        isOriginal: true,
        expansionType: 'original',
      })),
      metrics: { expanded: false, originalCount: documents.length, expandedCount: 0 },
    };
  }

  const startTime = Date.now();
  const expandedChunks = [];
  const processedSources = new Map(); // Track chunks per source
  let siblingsAdded = 0;

  for (const doc of documents) {
    const sourceId = doc.metadata?.sourceId;
    const position =
      doc.metadata?.chunkIndex ??
      doc.metadata?.position ??
      extractPositionFromId(doc.metadata?.vectorStoreId);
    const score = doc.metadata?.score ?? doc.score ?? 1;

    // Add original chunk
    expandedChunks.push({
      ...doc,
      isOriginal: true,
      expansionType: 'original',
      position: position ?? 0,
    });

    // Skip expansion for low-scoring documents or missing position
    if (score < minScore || position === null || !sourceId) {
      continue;
    }

    // Check if we've already expanded this source enough
    const sourceChunkCount = processedSources.get(sourceId) || 0;
    if (sourceChunkCount >= maxChunksPerSource) {
      continue;
    }

    // Fetch sibling chunks
    const siblings = await fetchSiblingChunks(workspaceId, sourceId, position, windowSize);

    for (const sibling of siblings) {
      // Avoid duplicates
      const siblingPosition =
        sibling.metadata?.chunkIndex ??
        sibling.metadata?.position ??
        extractPositionFromId(sibling.metadata?.vectorStoreId);

      const isDuplicate = expandedChunks.some(
        (ec) =>
          ec.metadata?.sourceId === sourceId &&
          (ec.position === siblingPosition || ec.pageContent === sibling.pageContent)
      );

      if (!isDuplicate && sourceChunkCount < maxChunksPerSource) {
        expandedChunks.push({
          ...sibling,
          isOriginal: false,
          expansionType: siblingPosition < position ? 'sibling_before' : 'sibling_after',
          position: siblingPosition ?? 0,
        });
        siblingsAdded++;
        processedSources.set(sourceId, (processedSources.get(sourceId) || 0) + 1);
      }
    }

    processedSources.set(sourceId, (processedSources.get(sourceId) || 0) + 1);
  }

  // Sort expanded chunks by source then position for coherent reading
  expandedChunks.sort((a, b) => {
    const sourceCompare = (a.metadata?.sourceId || '').localeCompare(b.metadata?.sourceId || '');
    if (sourceCompare !== 0) return sourceCompare;
    return (a.position || 0) - (b.position || 0);
  });

  const metrics = {
    expanded: siblingsAdded > 0,
    originalCount: documents.length,
    expandedCount: siblingsAdded,
    totalChunks: expandedChunks.length,
    uniqueSources: processedSources.size,
    processingTimeMs: Date.now() - startTime,
  };

  logger.info('Context expansion complete', {
    service: 'context-expansion',
    ...metrics,
  });

  return { chunks: expandedChunks, metrics };
}

/**
 * Merge expanded chunks back into coherent text
 * Groups chunks by source and joins them in order
 *
 * @param {ExpandedChunk[]} chunks - Expanded chunks
 * @returns {Object[]} Merged documents with combined content
 */
export function mergeExpandedChunks(chunks) {
  // Group by source
  const sourceGroups = new Map();

  for (const chunk of chunks) {
    const sourceId = chunk.metadata?.sourceId || 'unknown';
    if (!sourceGroups.has(sourceId)) {
      sourceGroups.set(sourceId, []);
    }
    sourceGroups.get(sourceId).push(chunk);
  }

  // Merge each group
  const merged = [];
  for (const [sourceId, sourceChunks] of sourceGroups) {
    // Sort by position
    sourceChunks.sort((a, b) => (a.position || 0) - (b.position || 0));

    // Combine content
    const combinedContent = sourceChunks.map((c) => c.pageContent).join('\n\n');

    // Use metadata from first original chunk
    const originalChunk = sourceChunks.find((c) => c.isOriginal) || sourceChunks[0];

    merged.push({
      pageContent: combinedContent,
      metadata: {
        ...originalChunk.metadata,
        isExpanded: sourceChunks.length > 1,
        chunkCount: sourceChunks.length,
        originalPositions: sourceChunks.filter((c) => c.isOriginal).map((c) => c.position),
      },
    });
  }

  return merged;
}

/**
 * Get document summary/overview chunk if available
 * Some chunking strategies create a summary chunk at position 0
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Source document ID
 * @returns {Promise<Object|null>} Summary chunk or null
 */
export async function fetchDocumentSummaryChunk(workspaceId, sourceId) {
  const client = getQdrantClient();

  try {
    const result = await client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.sourceId', match: { value: sourceId } },
          { key: 'metadata.isSummary', match: { value: true } },
        ],
      },
      limit: 1,
      with_payload: true,
      with_vector: false,
    });

    if (result.points && result.points.length > 0) {
      return {
        pageContent: result.points[0].payload?.pageContent || '',
        metadata: result.points[0].payload?.metadata || {},
      };
    }

    return null;
  } catch (error) {
    logger.debug('No summary chunk found', {
      service: 'context-expansion',
      sourceId,
    });
    return null;
  }
}

export default {
  fetchSiblingChunks,
  fetchParentDocumentChunks,
  expandDocumentContext,
  mergeExpandedChunks,
  fetchDocumentSummaryChunk,
  EXPANSION_CONFIG,
};

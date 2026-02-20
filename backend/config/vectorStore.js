import { QdrantVectorStore } from '@langchain/qdrant';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';
import {
  embeddings,
  BATCH_CONFIG,
  getEmbeddingMetrics,
  isCloudAvailable,
  createEmbeddingContext,
} from './embeddings.js';
import { selectProvider } from './embeddingProvider.js';
import { recordEmbeddingUsage } from '../services/metrics/syncMetrics.js';
import { wrapWithTenantIsolation } from '../services/security/tenantIsolation.js';
import { promiseWithTimeout } from '../utils/core/asyncHelpers.js';
import logger from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

// ISSUE #11 FIX: Embedding timeout configuration
const EMBEDDING_TIMEOUT_MS = parseInt(process.env.EMBEDDING_TIMEOUT_MS) || 120000; // 2 minutes default

// Environment flag to enable/disable tenant isolation enforcement (default: enabled)
const ENFORCE_TENANT_ISOLATION = process.env.ENFORCE_TENANT_ISOLATION !== 'false';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

// Qdrant client for direct operations
let qdrantClient = null;

function getQdrantClient() {
  if (!qdrantClient) {
    const options = { url: QDRANT_URL };
    if (QDRANT_API_KEY) {
      options.apiKey = QDRANT_API_KEY;
    }
    qdrantClient = new QdrantClient(options);
  }
  return qdrantClient;
}

/**
 * Get or create vector store (for queries)
 * SECURITY: Returns a tenant-isolated vector store that enforces workspaceId filtering
 *
 * @param {Array} docs - Documents to index (optional)
 * @param {Object} options - Options including workspace for hybrid embeddings
 * @returns {Promise<Object>} Tenant-isolated vector store
 */
export const getVectorStore = async (docs, options = {}) => {
  // If docs provided, use the optimized batch indexing
  // Note: Indexing doesn't need tenant isolation (workspaceId is in metadata)
  if (docs && docs.length > 0) {
    return indexDocumentsBatched(docs, options);
  }

  // Return existing store for queries - wrapped with tenant isolation
  // IMPORTANT: contentPayloadKey must match how we store documents (payload.pageContent)
  // ISSUE #10 FIX: Wrap in try-catch with meaningful error handling
  let vectorStore;
  try {
    vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      collectionName: COLLECTION_NAME,
      contentPayloadKey: 'pageContent', // Match the key used during indexing
    });
  } catch (error) {
    // Provide meaningful error messages for common issues
    if (error.message?.includes('Not found') || error.message?.includes("doesn't exist")) {
      logger.error('Qdrant collection not found', {
        service: 'vector-store',
        collection: COLLECTION_NAME,
        qdrantUrl: QDRANT_URL,
        error: error.message,
      });
      throw new Error(
        `Vector store collection "${COLLECTION_NAME}" not found. ` +
          `Ensure Qdrant is running at ${QDRANT_URL} and documents have been indexed.`
      );
    }

    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      logger.error('Qdrant connection refused', {
        service: 'vector-store',
        qdrantUrl: QDRANT_URL,
        error: error.message,
      });
      throw new Error(
        `Cannot connect to Qdrant at ${QDRANT_URL}. ` + `Ensure Qdrant is running and accessible.`
      );
    }

    // Re-throw with context for other errors
    logger.error('Failed to connect to vector store', {
      service: 'vector-store',
      collection: COLLECTION_NAME,
      error: error.message,
    });
    throw new Error(`Vector store connection failed: ${error.message}`);
  }

  // DEFENSE-IN-DEPTH: Wrap with tenant isolation enforcement
  // This ensures ALL searches must include metadata.workspaceId filter
  if (ENFORCE_TENANT_ISOLATION) {
    return wrapWithTenantIsolation(vectorStore);
  }

  logger.warn('Tenant isolation enforcement is DISABLED - this is a security risk', {
    service: 'vector-store',
  });
  return vectorStore;
};

/**
 * Index documents with optimized batched embeddings
 *
 * This is the key optimization:
 * - Pre-embed all documents in efficient batches
 * - Then upsert to Qdrant in batches
 * - Much faster than sequential embedding
 *
 * @param {Array} docs - LangChain documents to index
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback
 * @param {Object} options.workspace - Workspace for hybrid embedding routing
 * @returns {Promise<Object>} Indexing results
 */
export async function indexDocumentsBatched(docs, options = {}) {
  const { onProgress, workspace } = options;
  const startTime = Date.now();

  if (!docs || docs.length === 0) {
    logger.warn('No documents to index', { service: 'vector-store' });
    return { indexed: 0, timeMs: 0 };
  }

  logger.info('Starting batched document indexing', {
    service: 'vector-store',
    documentCount: docs.length,
    batchConfig: {
      maxChunks: BATCH_CONFIG.maxChunks,
      maxTokens: BATCH_CONFIG.maxTokens,
    },
  });

  // Extract texts for embedding
  const texts = docs.map((doc) => doc.pageContent);

  // Phase 1: Batch embed all texts
  // Pass workspace for hybrid embedding (local/cloud) routing
  // ISSUE #11 FIX: Add timeout to prevent indefinite hangs
  const embedStartTime = Date.now();
  let vectors;
  try {
    vectors = await promiseWithTimeout(
      embeddings.embedDocuments(texts, {
        workspace, // Pass workspace for hybrid embedding system
        onProgress: (batchNum, totalBatches, chunksProcessed) => {
          if (onProgress) {
            onProgress({
              phase: 'embedding',
              batchNum,
              totalBatches,
              chunksProcessed,
              totalChunks: texts.length,
            });
          }
        },
      }),
      EMBEDDING_TIMEOUT_MS,
      `Embedding operation timed out after ${EMBEDDING_TIMEOUT_MS / 1000}s. ` +
        `Consider reducing batch size or checking embedding service health.`
    );
  } catch (error) {
    // Log and re-throw with context
    logger.error('Embedding operation failed', {
      service: 'vector-store',
      documentCount: docs.length,
      timeoutMs: EMBEDDING_TIMEOUT_MS,
      error: error.message,
      isTimeout: error.message?.includes('timed out'),
    });
    throw error;
  }
  const embedTime = Date.now() - embedStartTime;

  // Determine which provider was used for metrics tracking
  let usedProvider = 'local';
  if (workspace && isCloudAvailable()) {
    const context = createEmbeddingContext(workspace);
    usedProvider = selectProvider(context);
  }

  logger.info('Embedding phase complete', {
    service: 'vector-store',
    chunksEmbedded: vectors.length,
    embedTimeMs: embedTime,
    chunksPerSec: ((vectors.length / embedTime) * 1000).toFixed(1),
    provider: usedProvider,
  });

  // Record embedding usage for metrics dashboard
  const workspaceId = workspace?.workspaceId || workspace?._id?.toString();
  if (workspaceId) {
    recordEmbeddingUsage(workspaceId, {
      provider: usedProvider,
      chunkCount: vectors.length,
      tokensUsed: docs.reduce((sum, d) => sum + Math.ceil(d.pageContent.length / 4), 0),
    });
  }

  // Phase 2: Batch upsert to Qdrant
  const upsertStartTime = Date.now();
  const client = getQdrantClient();

  // Ensure collection exists
  await ensureCollection(client, vectors[0].length);

  // Sanitize text to remove invalid Unicode surrogates
  const sanitizeText = (text) => {
    if (typeof text !== 'string') return text;
    // Remove lone surrogates that cause JSON encoding issues
    return text.replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      '\uFFFD'
    );
  };

  // Create points for Qdrant with sanitized content
  const points = docs.map((doc, i) => ({
    id: generatePointId(),
    vector: vectors[i],
    payload: {
      pageContent: sanitizeText(doc.pageContent),
      metadata: doc.metadata,
    },
  }));

  // Upsert in batches (Qdrant recommends ~100 points per batch)
  const UPSERT_BATCH_SIZE = 100;
  let upsertedCount = 0;

  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const batch = points.slice(i, i + UPSERT_BATCH_SIZE);

    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch,
    });

    upsertedCount += batch.length;

    if (onProgress) {
      onProgress({
        phase: 'indexing',
        indexed: upsertedCount,
        total: points.length,
      });
    }
  }

  const upsertTime = Date.now() - upsertStartTime;
  const totalTime = Date.now() - startTime;

  const result = {
    indexed: docs.length,
    embedTimeMs: embedTime,
    upsertTimeMs: upsertTime,
    totalTimeMs: totalTime,
    chunksPerSec: ((docs.length / totalTime) * 1000).toFixed(1),
    metrics: getEmbeddingMetrics(),
  };

  logger.info('Batched indexing complete', {
    service: 'vector-store',
    ...result,
  });

  // Return a vector store instance for compatibility
  // IMPORTANT: contentPayloadKey must match how we store documents (payload.pageContent)
  let vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    collectionName: COLLECTION_NAME,
    contentPayloadKey: 'pageContent', // Match the key used during indexing
  });

  // DEFENSE-IN-DEPTH: Wrap with tenant isolation enforcement
  if (ENFORCE_TENANT_ISOLATION) {
    vectorStore = wrapWithTenantIsolation(vectorStore);
  }

  // Attach result metadata
  vectorStore._indexingResult = result;

  return vectorStore;
}

/**
 * Ensure Qdrant collection exists with correct configuration
 */
async function ensureCollection(client, vectorSize) {
  try {
    await client.getCollection(COLLECTION_NAME);
  } catch (_err) {
    // Collection doesn't exist, create it
    logger.info('Creating Qdrant collection', {
      service: 'vector-store',
      collection: COLLECTION_NAME,
      vectorSize,
    });

    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });
  }
}

/**
 * Generate unique point ID for Qdrant
 * Qdrant requires either unsigned integers or UUIDs
 */
function generatePointId() {
  return randomUUID();
}

/**
 * Get indexing statistics
 */
export async function getIndexStats() {
  try {
    const client = getQdrantClient();
    const collection = await client.getCollection(COLLECTION_NAME);

    return {
      collection: COLLECTION_NAME,
      pointsCount: collection.points_count,
      vectorsCount: collection.vectors_count,
      indexedVectorsCount: collection.indexed_vectors_count,
      status: collection.status,
    };
  } catch (error) {
    logger.error('Failed to get index stats', { error: error.message });
    return null;
  }
}

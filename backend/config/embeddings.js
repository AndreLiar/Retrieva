import { AzureOpenAIEmbeddings } from '@langchain/openai';
import logger from './logger.js';
import {
  embedTexts as hybridEmbedTexts,
  createEmbeddingContext,
  isCloudAvailable,
} from './embeddingProvider.js';

// =============================================================================
// EMBEDDING CONFIGURATION (Azure OpenAI)
// =============================================================================

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'azure';

// Azure OpenAI Configuration
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

// Extract instance name from endpoint URL (e.g., https://oai-rag-backend-wz5nh9.openai.azure.com/)
const AZURE_OPENAI_INSTANCE_NAME =
  process.env.AZURE_OPENAI_INSTANCE_NAME ||
  (AZURE_OPENAI_ENDPOINT ? AZURE_OPENAI_ENDPOINT.match(/https:\/\/([^.]+)\./)?.[1] : undefined);

// Hybrid embeddings disabled - Azure-only mode
const ENABLE_HYBRID_EMBEDDINGS = false;

/**
 * Batch configuration for optimal throughput
 * - maxChunks: Maximum chunks per batch (prevents memory issues)
 * - maxTokens: Maximum tokens per batch (model context limit)
 * - charsPerToken: Estimation ratio for token calculation
 */
export const BATCH_CONFIG = {
  maxChunks: parseInt(process.env.EMBEDDING_BATCH_MAX_CHUNKS) || 50,
  maxTokens: parseInt(process.env.EMBEDDING_BATCH_MAX_TOKENS) || 8192,
  charsPerToken: 4,
  get maxCharsPerBatch() {
    return this.maxTokens * this.charsPerToken;
  },
  // Per-chunk limits — derived from the embedding model's context window.
  // MAX_EMBEDDING_CHARS takes explicit precedence; otherwise we compute
  // from EMBEDDING_CONTEXT_TOKENS (default 8192 for bge-m3).
  // 90% of the context window is used to leave headroom for special tokens.
  get maxCharsPerChunk() {
    const explicit = process.env.MAX_EMBEDDING_CHARS;
    if (explicit) return parseInt(explicit, 10);
    const ctxTokens = parseInt(process.env.EMBEDDING_CONTEXT_TOKENS, 10) || 8192;
    return Math.floor(ctxTokens * 0.9 * this.charsPerToken);
  },
};

// =============================================================================
// METRICS TRACKING
// =============================================================================

const metrics = {
  totalChunksEmbedded: 0,
  totalBatches: 0,
  totalTimeMs: 0,
  errors: 0,
  truncations: 0,

  reset() {
    this.totalChunksEmbedded = 0;
    this.totalBatches = 0;
    this.totalTimeMs = 0;
    this.errors = 0;
    this.truncations = 0;
  },

  get chunksPerSecond() {
    if (this.totalTimeMs === 0) return 0;
    return (this.totalChunksEmbedded / this.totalTimeMs) * 1000;
  },

  get avgBatchLatencyMs() {
    if (this.totalBatches === 0) return 0;
    return this.totalTimeMs / this.totalBatches;
  },
};

export function getEmbeddingMetrics() {
  return {
    totalChunksEmbedded: metrics.totalChunksEmbedded,
    totalBatches: metrics.totalBatches,
    totalTimeMs: metrics.totalTimeMs,
    chunksPerSecond: metrics.chunksPerSecond.toFixed(2),
    avgBatchLatencyMs: metrics.avgBatchLatencyMs.toFixed(0),
    errors: metrics.errors,
    truncations: metrics.truncations,
  };
}

export function resetEmbeddingMetrics() {
  metrics.reset();
}

// =============================================================================
// BASE EMBEDDINGS (Azure OpenAI)
// =============================================================================

// Azure OpenAI concurrent request limit
// Increase for higher throughput (check your Azure tier limits)
// S0 (Basic): 5-10 safe, Standard: 10-20 safe
const EMBEDDING_MAX_CONCURRENCY = parseInt(process.env.EMBEDDING_MAX_CONCURRENCY) || 10;

const baseEmbeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: AZURE_OPENAI_API_KEY,
  azureOpenAIApiInstanceName: AZURE_OPENAI_INSTANCE_NAME,
  azureOpenAIApiDeploymentName: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: AZURE_OPENAI_API_VERSION,
  maxConcurrency: EMBEDDING_MAX_CONCURRENCY,
});

// Log embedding provider on startup
logger.info('Embeddings configured', {
  service: 'embeddings',
  provider: 'azure',
  instanceName: AZURE_OPENAI_INSTANCE_NAME,
  deployment: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
});

// =============================================================================
// BATCHED EMBEDDINGS CLASS
// =============================================================================

/**
 * BatchedEmbeddings - Optimized embeddings with batching and metrics
 *
 * Key features:
 * - Automatic batching by chunk count AND token count
 * - Text truncation for safety
 * - Detailed metrics tracking
 * - Progress callbacks for long-running operations
 */
class BatchedEmbeddings {
  constructor(baseEmbeddings, config) {
    this.baseEmbeddings = baseEmbeddings;
    this.config = config;
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text) {
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  /**
   * Truncate text to safe length for embedding model
   */
  truncateText(text) {
    if (text.length <= this.config.maxCharsPerChunk) {
      return text;
    }
    metrics.truncations++;
    logger.warn('Truncating text for embedding', {
      service: 'embeddings',
      originalLength: text.length,
      truncatedLength: this.config.maxCharsPerChunk,
    });
    const truncated = text.slice(0, this.config.maxCharsPerChunk);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > this.config.maxCharsPerChunk * 0.8) {
      return truncated.slice(0, lastSpace);
    }
    return truncated;
  }

  /**
   * Embed a single text with progressive truncation on context length errors
   * Retries with 50%, 25%, then 10% of original length
   */
  async embedWithRetry(text) {
    const truncationFactors = [1.0, 0.5, 0.25, 0.1];
    for (const factor of truncationFactors) {
      const truncatedText =
        factor < 1.0 ? text.slice(0, Math.max(100, Math.floor(text.length * factor))) : text;

      try {
        const result = await this.baseEmbeddings.embedQuery(truncatedText);
        if (factor < 1.0) {
          metrics.truncations++;
          logger.warn('Text embedded after truncation', {
            service: 'embeddings',
            originalLength: text.length,
            truncatedLength: truncatedText.length,
            factor,
          });
        }
        return result;
      } catch (error) {
        const isContextError =
          error.message?.includes('context length') || error.message?.includes('input length');

        if (!isContextError || factor === truncationFactors[truncationFactors.length - 1]) {
          metrics.errors++;
          logger.error('Text embedding failed even after truncation', {
            service: 'embeddings',
            textLength: truncatedText.length,
            factor,
            error: error.message,
          });
          throw error;
        }

        logger.debug(
          `Retrying with ${Math.round(truncationFactors[truncationFactors.indexOf(factor) + 1] * 100)}% of text`,
          {
            service: 'embeddings',
            currentLength: truncatedText.length,
          }
        );
      }
    }
  }

  /**
   * Split texts into optimal batches based on chunk count AND token count
   */
  createBatches(texts) {
    const batches = [];
    let currentBatch = [];
    let currentTokens = 0;

    for (const text of texts) {
      const tokens = this.estimateTokens(text);

      // Check if adding this text would exceed limits
      const wouldExceedChunks = currentBatch.length >= this.config.maxChunks;
      const wouldExceedTokens = currentTokens + tokens > this.config.maxTokens;

      if (currentBatch.length > 0 && (wouldExceedChunks || wouldExceedTokens)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }

      currentBatch.push(text);
      currentTokens += tokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Embed a single query with safety truncation
   */
  async embedQuery(text) {
    const safeText = this.truncateText(text);
    const startTime = Date.now();

    try {
      const result = await this.baseEmbeddings.embedQuery(safeText);
      metrics.totalChunksEmbedded++;
      metrics.totalBatches++;
      metrics.totalTimeMs += Date.now() - startTime;
      return result;
    } catch (error) {
      metrics.errors++;
      throw error;
    }
  }

  /**
   * Embed multiple documents with batching and metrics
   *
   * @param {string[]} texts - Array of texts to embed
   * @param {Object} options - Options
   * @param {Function} options.onProgress - Progress callback (batchNum, totalBatches, chunksProcessed)
   * @param {Object} options.workspace - Workspace for hybrid embedding (Phase 2)
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedDocuments(texts, options = {}) {
    const { onProgress, workspace } = options;
    const startTime = Date.now();

    // Truncate all texts to safe length
    const safeTexts = texts.map((text) => this.truncateText(text));

    // Phase 2: Use hybrid embedding system if enabled and workspace provided
    if (ENABLE_HYBRID_EMBEDDINGS && workspace) {
      return this.embedDocumentsHybrid(safeTexts, { onProgress, workspace });
    }

    // Create optimal batches
    const batches = this.createBatches(safeTexts);

    logger.info('Starting batched embedding', {
      service: 'embeddings',
      totalTexts: texts.length,
      totalBatches: batches.length,
      avgBatchSize: (texts.length / batches.length).toFixed(1),
      config: {
        maxChunks: this.config.maxChunks,
        maxTokens: this.config.maxTokens,
      },
    });

    const allEmbeddings = [];
    let chunksProcessed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();

      try {
        // Embed the batch
        const batchEmbeddings = await this.baseEmbeddings.embedDocuments(batch);
        allEmbeddings.push(...batchEmbeddings);

        chunksProcessed += batch.length;
        const batchTime = Date.now() - batchStartTime;

        // Update metrics
        metrics.totalChunksEmbedded += batch.length;
        metrics.totalBatches++;
        metrics.totalTimeMs += batchTime;

        // Log batch progress
        logger.debug('Batch embedded', {
          service: 'embeddings',
          batch: i + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
          batchTimeMs: batchTime,
          chunksPerSec: ((batch.length / batchTime) * 1000).toFixed(1),
        });

        // Progress callback
        if (onProgress) {
          onProgress(i + 1, batches.length, chunksProcessed);
        }
      } catch (error) {
        const isContextLengthError =
          error.message?.includes('context length') || error.message?.includes('input length');

        if (isContextLengthError && batch.length > 0) {
          // Context length exceeded - retry each text individually with progressive truncation
          logger.warn('Batch exceeded context length, retrying texts individually', {
            service: 'embeddings',
            batch: i + 1,
            batchSize: batch.length,
          });

          for (const text of batch) {
            const embedding = await this.embedWithRetry(text);
            allEmbeddings.push(embedding);
            chunksProcessed++;
          }

          metrics.totalChunksEmbedded += batch.length;
          metrics.totalBatches++;
          metrics.totalTimeMs += Date.now() - batchStartTime;

          if (onProgress) {
            onProgress(i + 1, batches.length, chunksProcessed);
          }
        } else {
          metrics.errors++;
          logger.error('Batch embedding failed', {
            service: 'embeddings',
            batch: i + 1,
            batchSize: batch.length,
            error: error.message,
          });
          throw error;
        }
      }
    }

    const totalTime = Date.now() - startTime;
    logger.info('Batched embedding complete', {
      service: 'embeddings',
      totalTexts: texts.length,
      totalBatches: batches.length,
      totalTimeMs: totalTime,
      chunksPerSec: ((texts.length / totalTime) * 1000).toFixed(1),
    });

    return allEmbeddings;
  }

  /**
   * Phase 2: Embed documents using hybrid provider system
   * Routes to cloud or local based on workspace settings
   */
  async embedDocumentsHybrid(texts, options = {}) {
    const { onProgress, workspace } = options;
    const startTime = Date.now();
    const context = createEmbeddingContext(workspace);

    // Create optimal batches
    const batches = this.createBatches(texts);

    logger.info('Starting hybrid batched embedding', {
      service: 'embeddings-hybrid',
      totalTexts: texts.length,
      totalBatches: batches.length,
      trustLevel: context.trustLevel,
      cloudAvailable: isCloudAvailable(),
      preferCloud: context.preferCloud,
    });

    const allEmbeddings = [];
    const allMetadata = [];
    let chunksProcessed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();

      try {
        // Use hybrid embedding system
        const result = await hybridEmbedTexts(batch, context);
        allEmbeddings.push(...result.embeddings);
        allMetadata.push(result.metadata);

        chunksProcessed += batch.length;
        const batchTime = Date.now() - batchStartTime;

        // Update metrics
        metrics.totalChunksEmbedded += batch.length;
        metrics.totalBatches++;
        metrics.totalTimeMs += batchTime;

        // Log batch progress
        logger.debug('Hybrid batch embedded', {
          service: 'embeddings-hybrid',
          batch: i + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
          provider: result.metadata.provider,
          batchTimeMs: batchTime,
        });

        // Progress callback
        if (onProgress) {
          onProgress(i + 1, batches.length, chunksProcessed);
        }
      } catch (error) {
        metrics.errors++;
        logger.error('Hybrid batch embedding failed', {
          service: 'embeddings-hybrid',
          batch: i + 1,
          batchSize: batch.length,
          error: error.message,
        });
        throw error;
      }
    }

    const totalTime = Date.now() - startTime;
    logger.info('Hybrid batched embedding complete', {
      service: 'embeddings-hybrid',
      totalTexts: texts.length,
      totalBatches: batches.length,
      totalTimeMs: totalTime,
      chunksPerSec: ((texts.length / totalTime) * 1000).toFixed(1),
    });

    return allEmbeddings;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const embeddings = new BatchedEmbeddings(baseEmbeddings, BATCH_CONFIG);

// Export config for visibility
export { EMBEDDING_MODEL, EMBEDDING_PROVIDER };

// Phase 2: Re-export hybrid embedding utilities
export {
  isCloudAvailable,
  createEmbeddingContext,
  getEmbeddingPrefixes,
} from './embeddingProvider.js';

export {
  EmbeddingProvider,
  TrustLevel,
  getProviderMetrics,
  getCloudConsentDisclosure,
  canUseCloudEmbeddings,
  getCloudProviderType,
  auditLog,
} from './embeddingProvider.js';

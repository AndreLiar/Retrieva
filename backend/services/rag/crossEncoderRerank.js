/**
 * Cross-Encoder Re-ranking Module
 *
 * Provides neural re-ranking using cross-encoder models for improved
 * document ranking quality. Supports multiple providers:
 * - Cohere Rerank API
 * - Azure OpenAI (with custom prompt)
 * - LLM-based re-ranking (fallback)
 *
 * Cross-encoders are more accurate than bi-encoders (dense retrieval)
 * because they can attend to both query and document simultaneously.
 *
 * @module services/rag/crossEncoderRerank
 */

import logger from '../../config/logger.js';
import { getDefaultLLM } from '../../config/llm.js';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * Re-ranking provider configuration
 */
export const RERANK_CONFIG = {
  // Provider: 'cohere' | 'azure' | 'llm' | 'none'
  provider: process.env.RERANK_PROVIDER || 'llm',
  // Cohere API key (if using Cohere)
  cohereApiKey: process.env.COHERE_API_KEY,
  // Model for re-ranking
  cohereModel: process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0',
  // Number of top documents to return after re-ranking
  topN: parseInt(process.env.RERANK_TOP_N) || 5,
  // Enable/disable re-ranking
  enabled: process.env.ENABLE_CROSS_ENCODER_RERANK === 'true',
  // Minimum score threshold (provider-specific)
  minScore: parseFloat(process.env.RERANK_MIN_SCORE) || 0.1,
  // Request timeout in ms
  timeout: parseInt(process.env.RERANK_TIMEOUT) || 10000,
  // Cache results (TTL in seconds)
  cacheTTL: parseInt(process.env.RERANK_CACHE_TTL) || 300,
};

/**
 * @typedef {Object} RerankResult
 * @property {Object[]} documents - Re-ranked documents
 * @property {string} provider - Provider used for re-ranking
 * @property {number} processingTimeMs - Time taken
 * @property {boolean} success - Whether re-ranking succeeded
 */

/**
 * Simple LRU cache for re-ranking results
 */
class RerankCache {
  constructor(maxSize = 100, ttlMs = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  _generateKey(query, docIds) {
    return `${query.substring(0, 100)}_${docIds.slice(0, 5).join(',')}`;
  }

  get(query, documents) {
    const docIds = documents.map((d) => d.pageContent.substring(0, 50));
    const key = this._generateKey(query, docIds);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.result;
    }

    return null;
  }

  set(query, documents, result) {
    const docIds = documents.map((d) => d.pageContent.substring(0, 50));
    const key = this._generateKey(query, docIds);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { result, timestamp: Date.now() });
  }
}

const rerankCache = new RerankCache(100, RERANK_CONFIG.cacheTTL * 1000);

/**
 * Re-rank documents using Cohere Rerank API
 *
 * @param {string} query - Search query
 * @param {Object[]} documents - Documents to re-rank
 * @param {Object} options - Re-ranking options
 * @returns {Promise<RerankResult>} Re-ranked documents
 */
async function rerankWithCohere(query, documents, options = {}) {
  const { topN = RERANK_CONFIG.topN, minScore = RERANK_CONFIG.minScore } = options;

  if (!RERANK_CONFIG.cohereApiKey) {
    throw new Error('COHERE_API_KEY is required for Cohere re-ranking');
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.cohere.ai/v1/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RERANK_CONFIG.cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RERANK_CONFIG.cohereModel,
        query,
        documents: documents.map((d) => d.pageContent),
        top_n: topN,
        return_documents: false, // We'll map back ourselves
      }),
      signal: AbortSignal.timeout(RERANK_CONFIG.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Map results back to original documents with scores
    const rerankedDocs = data.results
      .filter((r) => r.relevance_score >= minScore)
      .map((r) => ({
        ...documents[r.index],
        rerankScore: r.relevance_score,
        rerankRank: r.index + 1,
        metadata: {
          ...documents[r.index].metadata,
          rerankScore: r.relevance_score,
          rerankProvider: 'cohere',
        },
      }));

    logger.info('Cohere re-ranking complete', {
      service: 'cross-encoder',
      inputDocs: documents.length,
      outputDocs: rerankedDocs.length,
      topScore: rerankedDocs[0]?.rerankScore?.toFixed(4),
      processingTimeMs: Date.now() - startTime,
    });

    return {
      documents: rerankedDocs,
      provider: 'cohere',
      processingTimeMs: Date.now() - startTime,
      success: true,
    };
  } catch (error) {
    logger.error('Cohere re-ranking failed', {
      service: 'cross-encoder',
      error: error.message,
    });
    throw error;
  }
}

/**
 * LLM-based re-ranking prompt
 */
const LLM_RERANK_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a relevance scoring expert. Given a query and a document, rate how relevant the document is to answering the query.

Score from 0 to 10:
- 10: Directly answers the query with specific information
- 7-9: Highly relevant, contains key information
- 4-6: Somewhat relevant, contains related context
- 1-3: Tangentially related
- 0: Not relevant at all

Respond with ONLY a JSON object: {{"score": <number>, "reason": "<brief reason>"}}`,
  ],
  [
    'user',
    `Query: {query}

Document:
{document}

Rate the relevance (0-10):`,
  ],
]);

/**
 * Re-rank documents using LLM scoring
 * Slower but more flexible than dedicated re-rankers
 *
 * @param {string} query - Search query
 * @param {Object[]} documents - Documents to re-rank
 * @param {Object} options - Re-ranking options
 * @returns {Promise<RerankResult>} Re-ranked documents
 */
async function rerankWithLLM(query, documents, options = {}) {
  const { topN = RERANK_CONFIG.topN, minScore = RERANK_CONFIG.minScore } = options;

  const startTime = Date.now();
  const llm = await getDefaultLLM();
  const chain = LLM_RERANK_PROMPT.pipe(llm).pipe(new StringOutputParser());

  // Score documents in parallel (with concurrency limit)
  const BATCH_SIZE = 5;
  const scoredDocs = [];

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (doc, batchIndex) => {
        try {
          const response = await chain.invoke({
            query,
            document: doc.pageContent.substring(0, 2000), // Limit context
          });

          // Parse JSON response
          const match = response.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            return {
              doc,
              score: Math.min(10, Math.max(0, parsed.score || 0)) / 10, // Normalize to 0-1
              reason: parsed.reason || '',
            };
          }
        } catch (parseError) {
          logger.debug('Failed to parse LLM rerank response', {
            service: 'cross-encoder',
            index: i + batchIndex,
            error: parseError.message,
          });
        }
        return { doc, score: 0.5, reason: 'Parse error - default score' };
      })
    );

    scoredDocs.push(...batchResults);
  }

  // Sort by score and filter
  const rerankedDocs = scoredDocs
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score >= minScore)
    .slice(0, topN)
    .map((r, index) => ({
      ...r.doc,
      rerankScore: r.score,
      rerankRank: index + 1,
      rerankReason: r.reason,
      metadata: {
        ...r.doc.metadata,
        rerankScore: r.score,
        rerankProvider: 'llm',
        rerankReason: r.reason,
      },
    }));

  logger.info('LLM re-ranking complete', {
    service: 'cross-encoder',
    inputDocs: documents.length,
    outputDocs: rerankedDocs.length,
    topScore: rerankedDocs[0]?.rerankScore?.toFixed(4),
    processingTimeMs: Date.now() - startTime,
  });

  return {
    documents: rerankedDocs,
    provider: 'llm',
    processingTimeMs: Date.now() - startTime,
    success: true,
  };
}

/**
 * Main re-ranking function - selects provider based on config
 *
 * @param {string} query - Search query
 * @param {Object[]} documents - Documents to re-rank
 * @param {Object} options - Re-ranking options
 * @returns {Promise<RerankResult>} Re-ranked documents
 */
export async function crossEncoderRerank(query, documents, options = {}) {
  // Check if re-ranking is enabled
  if (!RERANK_CONFIG.enabled) {
    return {
      documents,
      provider: 'none',
      processingTimeMs: 0,
      success: true,
    };
  }

  // Return empty if no documents
  if (!documents || documents.length === 0) {
    return {
      documents: [],
      provider: 'none',
      processingTimeMs: 0,
      success: true,
    };
  }

  // Check cache
  const cached = rerankCache.get(query, documents);
  if (cached) {
    logger.debug('Using cached re-ranking result', { service: 'cross-encoder' });
    return { ...cached, fromCache: true };
  }

  try {
    let result;

    switch (RERANK_CONFIG.provider) {
      case 'cohere':
        result = await rerankWithCohere(query, documents, options);
        break;

      case 'llm':
        result = await rerankWithLLM(query, documents, options);
        break;

      case 'none':
      default:
        // No re-ranking, return documents as-is with normalized structure
        result = {
          documents: documents.map((doc, i) => ({
            ...doc,
            rerankScore: doc.metadata?.score || 1 / (i + 1),
            rerankRank: i + 1,
          })),
          provider: 'none',
          processingTimeMs: 0,
          success: true,
        };
    }

    // Cache successful results
    rerankCache.set(query, documents, result);

    return result;
  } catch (error) {
    logger.error('Cross-encoder re-ranking failed, falling back to original order', {
      service: 'cross-encoder',
      provider: RERANK_CONFIG.provider,
      error: error.message,
    });

    // Graceful fallback - return original documents
    return {
      documents: documents.map((doc, i) => ({
        ...doc,
        rerankScore: doc.metadata?.score || 1 / (i + 1),
        rerankRank: i + 1,
      })),
      provider: 'fallback',
      processingTimeMs: 0,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if cross-encoder re-ranking is available
 * @returns {Object} Availability status and provider info
 */
export function getRerankStatus() {
  return {
    enabled: RERANK_CONFIG.enabled,
    provider: RERANK_CONFIG.provider,
    hasApiKey: RERANK_CONFIG.provider === 'cohere' ? !!RERANK_CONFIG.cohereApiKey : true,
    topN: RERANK_CONFIG.topN,
    minScore: RERANK_CONFIG.minScore,
  };
}

/**
 * Combine RRF re-ranking with cross-encoder for best results
 * Uses RRF for initial ranking, then cross-encoder for top candidates
 *
 * @param {Object[]} rrfRankedDocs - Documents already ranked by RRF
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object[]>} Final re-ranked documents
 */
export async function hybridRerank(rrfRankedDocs, query, options = {}) {
  const { crossEncoderTopK = 15, finalTopK = 5 } = options;

  // Take top K from RRF for cross-encoder re-ranking
  const candidates = rrfRankedDocs.slice(0, crossEncoderTopK);

  // Apply cross-encoder re-ranking
  const result = await crossEncoderRerank(query, candidates, {
    topN: finalTopK,
    ...options,
  });

  // Merge scores: combine RRF rank with cross-encoder score
  const finalDocs = result.documents.map((doc) => {
    const rrfDoc = rrfRankedDocs.find(
      (d) => d.pageContent.substring(0, 100) === doc.pageContent.substring(0, 100)
    );
    return {
      ...doc,
      combinedScore: (doc.rerankScore || 0) * 0.7 + (1 / (60 + (rrfDoc?.rrfRank || 60))) * 0.3,
      rrfRank: rrfDoc?.rrfRank,
      rrfScore: rrfDoc?.rrfScore,
    };
  });

  // Re-sort by combined score
  finalDocs.sort((a, b) => b.combinedScore - a.combinedScore);

  return finalDocs;
}

export default {
  crossEncoderRerank,
  hybridRerank,
  getRerankStatus,
  RERANK_CONFIG,
};

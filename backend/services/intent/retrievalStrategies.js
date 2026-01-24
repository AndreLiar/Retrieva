/**
 * Retrieval Strategies
 *
 * Implements different retrieval approaches for each intent type
 * - Focused retrieval for factual queries
 * - Multi-aspect retrieval for comparisons
 * - Deep retrieval for explanations
 * - Broad retrieval for aggregations
 *
 * @module services/intent/retrievalStrategies
 */

import {
  expandQuery,
  generateHypotheticalDocument,
  compressDocuments,
} from '../rag/retrievalEnhancements.js';
import { rerankDocuments } from '../rag/documentRanking.js';
import { deduplicateDocuments } from '../../utils/rag/contextFormatter.js';
import { sparseVectorManager } from '../search/sparseVector.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} StrategyResult
 * @property {Array} documents - Retrieved documents
 * @property {Object} metrics - Retrieval metrics
 * @property {string} strategy - Strategy used
 */

/**
 * Base retrieval function
 * @private
 */
async function baseRetrieve(query, retriever, vectorStore, filter, count) {
  if (filter) {
    return vectorStore.similaritySearch(query, count, filter);
  }
  return retriever.invoke(query);
}

/**
 * Focused Retrieval Strategy
 * For factual queries - fast, precise retrieval
 *
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function focusedRetrieval(query, retriever, vectorStore, config, options = {}) {
  const { filter = null, workspaceId = null } = options;
  const startTime = Date.now();

  // Single focused query
  let docs = await baseRetrieve(query, retriever, vectorStore, filter, config.topK);

  // Optional hybrid search with sparse vectors
  if (config.retrievalMode === 'hybrid' && workspaceId) {
    try {
      const hybridResults = await sparseVectorManager.hybridSearch(workspaceId, query, docs, {
        limit: config.topK,
        alpha: 0.6,
      });
      // Merge hybrid results with docs that have full content
      const hybridIds = new Set(hybridResults.map((r) => r.id));
      docs = docs.filter(
        (d) => hybridIds.has(d.metadata?.vectorStoreId) || !d.metadata?.vectorStoreId
      );
    } catch (error) {
      logger.debug('Hybrid search unavailable, using semantic only', {
        service: 'retrieval-strategies',
        error: error.message,
      });
    }
  }

  // Rerank if enabled
  if (config.useReranking && docs.length > config.rerankTopK) {
    docs = rerankDocuments(docs, query, config.rerankTopK);
  }

  // Compress if enabled
  if (config.useCompression) {
    docs = await compressDocuments(docs, query);
  }

  return {
    documents: docs,
    metrics: {
      strategy: 'focused_retrieval',
      retrieved: docs.length,
      processingTimeMs: Date.now() - startTime,
    },
    strategy: 'focused_retrieval',
  };
}

/**
 * Multi-Aspect Retrieval Strategy
 * For comparison queries - retrieves for each compared item
 *
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function multiAspectRetrieval(query, retriever, vectorStore, config, options = {}) {
  const { filter = null, entities = [] } = options;
  const startTime = Date.now();

  const allDocs = [];

  if (config.splitComparison && entities.length >= 2) {
    // Retrieve separately for each entity
    for (const entity of entities.slice(0, 3)) {
      const entityQuery =
        `${entity} ${query.replace(/\bvs\.?\b|\bversus\b|\bcompare\b/gi, '')}`.trim();
      const docs = await baseRetrieve(
        entityQuery,
        retriever,
        vectorStore,
        filter,
        Math.ceil(config.topK / entities.length)
      );
      allDocs.push(...docs.map((d) => ({ ...d, comparisonEntity: entity })));
    }
  } else {
    // Expand query for comparison aspects
    const variations = config.useQueryExpansion ? await expandQuery(query) : [query];

    for (const variation of variations) {
      const docs = await baseRetrieve(variation, retriever, vectorStore, filter, config.topK);
      allDocs.push(...docs);
    }
  }

  // Deduplicate
  let docs = deduplicateDocuments(allDocs);

  // Rerank
  if (config.useReranking && docs.length > config.rerankTopK) {
    docs = rerankDocuments(docs, query, config.rerankTopK);
  }

  // Compress
  if (config.useCompression) {
    docs = await compressDocuments(docs, query);
  }

  return {
    documents: docs,
    metrics: {
      strategy: 'multi_aspect_retrieval',
      entities: entities.length,
      retrieved: docs.length,
      processingTimeMs: Date.now() - startTime,
    },
    strategy: 'multi_aspect_retrieval',
  };
}

/**
 * Deep Retrieval Strategy
 * For explanation queries - comprehensive document gathering
 *
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function deepRetrieval(query, retriever, vectorStore, config, options = {}) {
  const { filter = null } = options;
  const startTime = Date.now();

  const allDocs = [];

  // Query expansion
  const variations = config.useQueryExpansion ? await expandQuery(query) : [query];

  // Retrieve for each variation
  for (const variation of variations) {
    const docs = await baseRetrieve(variation, retriever, vectorStore, filter, config.topK);
    allDocs.push(...docs);
  }

  // HyDE - Hypothetical Document Embeddings
  if (config.useHyDE) {
    const hypothetical = await generateHypotheticalDocument(query);
    const hydeDocs = await baseRetrieve(hypothetical, retriever, vectorStore, filter, 5);
    allDocs.push(...hydeDocs);
  }

  // Deduplicate
  let docs = deduplicateDocuments(allDocs);

  // Rerank with higher cutoff for comprehensive coverage
  if (config.useReranking && docs.length > config.rerankTopK) {
    docs = rerankDocuments(docs, query, config.rerankTopK);
  }

  // Compress while preserving detail
  if (config.useCompression) {
    docs = await compressDocuments(docs, query);
  }

  return {
    documents: docs,
    metrics: {
      strategy: 'deep_retrieval',
      queryVariations: variations.length,
      usedHyDE: config.useHyDE,
      retrieved: docs.length,
      processingTimeMs: Date.now() - startTime,
    },
    strategy: 'deep_retrieval',
  };
}

/**
 * Broad Retrieval Strategy
 * For aggregation queries - wide coverage across topics
 *
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function broadRetrieval(query, retriever, vectorStore, config, options = {}) {
  const { filter = null } = options;
  const startTime = Date.now();

  const allDocs = [];

  // Expand query
  const variations = config.useQueryExpansion ? await expandQuery(query) : [query];

  // Retrieve with higher K for breadth
  for (const variation of variations) {
    const docs = await baseRetrieve(variation, retriever, vectorStore, filter, config.topK);
    allDocs.push(...docs);
  }

  // Deduplicate
  let docs = deduplicateDocuments(allDocs);

  // Diversify results if enabled (reduce clustering)
  if (config.diversifyResults) {
    docs = diversifyResults(docs, config.rerankTopK);
  } else if (config.useReranking && docs.length > config.rerankTopK) {
    docs = rerankDocuments(docs, query, config.rerankTopK);
  }

  // Compress for summary
  if (config.useCompression) {
    docs = await compressDocuments(docs, query);
  }

  return {
    documents: docs,
    metrics: {
      strategy: 'broad_retrieval',
      queryVariations: variations.length,
      diversified: config.diversifyResults,
      retrieved: docs.length,
      processingTimeMs: Date.now() - startTime,
    },
    strategy: 'broad_retrieval',
  };
}

/**
 * Context-Only Strategy
 * For clarification queries - minimal/no retrieval, uses conversation
 *
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function contextOnlyRetrieval(query, retriever, vectorStore, config, options = {}) {
  const { filter = null, conversationContext = [] } = options;
  const startTime = Date.now();

  let docs = [];

  // Minimal retrieval to supplement context
  if (config.topK > 0) {
    docs = await baseRetrieve(query, retriever, vectorStore, filter, config.topK);
  }

  return {
    documents: docs,
    metrics: {
      strategy: 'context_only',
      retrieved: docs.length,
      contextMessages: conversationContext.length,
      processingTimeMs: Date.now() - startTime,
    },
    strategy: 'context_only',
  };
}

/**
 * No Retrieval Strategy
 * For chitchat/out-of-scope - skip retrieval entirely
 *
 * @param {string} query - Search query
 * @param {Object} config - Strategy configuration
 * @returns {Promise<StrategyResult>}
 */
export async function noRetrieval(query, config) {
  return {
    documents: [],
    metrics: {
      strategy: 'no_retrieval',
      retrieved: 0,
      processingTimeMs: 0,
    },
    strategy: 'no_retrieval',
  };
}

/**
 * Diversify results to reduce clustering
 * Selects documents from different sources/topics
 * @private
 */
function diversifyResults(docs, targetCount) {
  if (docs.length <= targetCount) return docs;

  const selected = [];
  const usedSources = new Set();

  // First pass: one doc per source
  for (const doc of docs) {
    const source = doc.metadata?.source || doc.metadata?.documentTitle || 'unknown';
    if (!usedSources.has(source) && selected.length < targetCount) {
      selected.push(doc);
      usedSources.add(source);
    }
  }

  // Second pass: fill remaining slots
  for (const doc of docs) {
    if (selected.length >= targetCount) break;
    if (!selected.includes(doc)) {
      selected.push(doc);
    }
  }

  return selected;
}

/**
 * Strategy executor - runs the appropriate strategy based on name
 *
 * @param {string} strategyName - Name of the strategy
 * @param {string} query - Search query
 * @param {Object} retriever - Vector store retriever
 * @param {Object} vectorStore - Vector store instance
 * @param {Object} config - Strategy configuration
 * @param {Object} options - Additional options
 * @returns {Promise<StrategyResult>}
 */
export async function executeStrategy(
  strategyName,
  query,
  retriever,
  vectorStore,
  config,
  options = {}
) {
  const strategyMap = {
    focused_retrieval: focusedRetrieval,
    multi_aspect_retrieval: multiAspectRetrieval,
    deep_retrieval: deepRetrieval,
    broad_retrieval: broadRetrieval,
    procedural_retrieval: deepRetrieval, // Uses deep retrieval
    context_only: contextOnlyRetrieval,
    no_retrieval: noRetrieval,
    balanced_retrieval: focusedRetrieval, // Uses focused with different params
    temporal_retrieval: focusedRetrieval, // Uses focused with date sorting
    decline: noRetrieval,
  };

  const strategy = strategyMap[strategyName] || focusedRetrieval;

  logger.debug('Executing retrieval strategy', {
    service: 'retrieval-strategies',
    strategy: strategyName,
    topK: config.topK,
  });

  // Handle no-retrieval strategies
  if (strategyName === 'no_retrieval' || strategyName === 'decline') {
    return strategy(query, config);
  }

  return strategy(query, retriever, vectorStore, config, options);
}

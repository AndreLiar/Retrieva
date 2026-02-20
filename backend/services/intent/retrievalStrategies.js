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
import { filterLowQualityChunks } from '../rag/chunkFilter.js';
import { deduplicateDocuments } from '../../utils/rag/contextFormatter.js';
import { sparseVectorManager } from '../search/sparseVector.js';
import { expandDocumentContext, EXPANSION_CONFIG } from '../rag/contextExpansion.js';
import { crossEncoderRerank, RERANK_CONFIG } from '../rag/crossEncoderRerank.js';
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
        alpha: 0.5, // 50% semantic, 50% BM25 - balanced for conceptual and keyword queries
      });

      // Build map of original docs by sourceId for matching with hybrid results
      const docsBySourceId = new Map();
      docs.forEach((d) => {
        const sourceId = d.metadata?.sourceId;
        if (sourceId) docsBySourceId.set(sourceId, d);
      });

      // For sparse-only results, we need to fetch content from Qdrant
      // Use vectorStoreId (Qdrant point ID) for fetching
      const sparseOnlyResults = hybridResults.filter((r) => !r.doc && r.sparseRank);
      const sparseOnlyVectorIds = sparseOnlyResults.map((r) => r.vectorStoreId).filter(Boolean);

      logger.info('Sparse-only results to fetch', {
        service: 'retrieval-strategies',
        sparseOnlyCount: sparseOnlyResults.length,
        vectorIdsCount: sparseOnlyVectorIds.length,
        sampleIds: sparseOnlyVectorIds.slice(0, 3),
        sampleResults: sparseOnlyResults.slice(0, 2).map((r) => ({
          id: r.id,
          vectorStoreId: r.vectorStoreId,
          sparseRank: r.sparseRank,
          hasDoc: !!r.doc,
        })),
      });

      const sparseOnlyDocs = new Map();
      if (sparseOnlyVectorIds.length > 0) {
        try {
          // Fetch content from Qdrant for sparse-only matches
          const { QdrantClient } = await import('@qdrant/js-client-rest');
          const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
          const collectionName = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';
          const apiKey = process.env.QDRANT_API_KEY;
          const client = new QdrantClient({ url: qdrantUrl, ...(apiKey && { apiKey }) });

          // Fetch points by vectorStoreId (Qdrant UUID)
          const points = await client.retrieve(collectionName, {
            ids: sparseOnlyVectorIds,
            with_payload: true,
            with_vector: false,
          });

          for (const point of points) {
            const sourceId = point.payload?.metadata?.sourceId;
            sparseOnlyDocs.set(sourceId || point.id, {
              pageContent: point.payload?.pageContent || '',
              metadata: {
                ...point.payload?.metadata,
                vectorStoreId: point.id,
                documentTitle: point.payload?.metadata?.documentTitle,
                documentUrl: point.payload?.metadata?.documentUrl,
                sourceId: sourceId,
                section: point.payload?.metadata?.section,
              },
            });
          }

          logger.debug('Fetched sparse-only documents from Qdrant', {
            service: 'retrieval-strategies',
            sparseOnlyCount: sparseOnlyDocs.size,
            fetchedIds: sparseOnlyVectorIds.length,
          });
        } catch (fetchError) {
          logger.warn('Failed to fetch sparse-only docs from Qdrant', {
            service: 'retrieval-strategies',
            error: fetchError.message,
          });
        }
      }

      // Reorder docs according to RRF ranking, including sparse-only matches
      const rerankedDocs = [];
      let sparseOnlyAdded = 0;
      for (const result of hybridResults) {
        // result.id is now sourceId, try to get doc from original dense results
        let doc = result.doc || docsBySourceId.get(result.id);

        // If not found in dense results, try sparse-only docs (keyed by sourceId)
        if (!doc && sparseOnlyDocs.has(result.id)) {
          doc = sparseOnlyDocs.get(result.id);
          sparseOnlyAdded++;
        }

        if (doc) {
          // Add RRF score to metadata for debugging/display
          doc.rrfScore = result.rrfScore;
          doc.metadata = doc.metadata || {};
          doc.metadata.rrfScore = result.rrfScore;
          doc.metadata.denseRank = result.denseRank;
          doc.metadata.sparseRank = result.sparseRank;
          rerankedDocs.push(doc);
        } else if (result.sparseRank && !result.denseRank) {
          // Log when we can't find a sparse-only doc
          logger.warn('Could not find sparse-only doc', {
            service: 'retrieval-strategies',
            resultId: result.id,
            vectorStoreId: result.vectorStoreId,
            sparseOnlyDocsKeys: Array.from(sparseOnlyDocs.keys()).slice(0, 5),
          });
        }
      }

      // Log top 5 results with ranking details
      const topResultsDebug = hybridResults.slice(0, 5).map((r, i) => ({
        rank: i + 1,
        title:
          r.doc?.metadata?.documentTitle ||
          sparseOnlyDocs.get(r.id)?.metadata?.documentTitle ||
          'unknown',
        rrfScore: r.rrfScore?.toFixed(4),
        denseRank: r.denseRank || '-',
        sparseRank: r.sparseRank || '-',
        normalizedSparseScore: r.normalizedSparseScore || '-',
        isSparseOnly: !r.denseRank && !!r.sparseRank,
      }));

      logger.info('Hybrid search reranking complete', {
        service: 'retrieval-strategies',
        originalDocs: docs.length,
        hybridResults: hybridResults.length,
        sparseOnlyFetched: sparseOnlyDocs.size,
        sparseOnlyAdded,
        finalDocs: rerankedDocs.length,
        topDoc: rerankedDocs[0]?.metadata?.documentTitle,
        top5Results: topResultsDebug,
      });

      docs = rerankedDocs;
    } catch (error) {
      logger.warn('Hybrid search failed, using semantic only', {
        service: 'retrieval-strategies',
        error: error.message,
      });
    }
  }

  // Rerank if enabled
  if (config.useReranking && docs.length > config.rerankTopK) {
    docs = rerankDocuments(docs, query, config.rerankTopK);
  }

  // Cross-encoder re-ranking for higher quality (if enabled)
  if (RERANK_CONFIG.enabled && docs.length > 0) {
    try {
      const rerankResult = await crossEncoderRerank(query, docs, {
        topN: config.rerankTopK || 5,
      });
      if (rerankResult.success) {
        docs = rerankResult.documents;
        logger.debug('Cross-encoder re-ranking applied', {
          service: 'retrieval-strategies',
          provider: rerankResult.provider,
          processingTimeMs: rerankResult.processingTimeMs,
        });
      }
    } catch (error) {
      logger.warn('Cross-encoder re-ranking failed, using RRF results', {
        service: 'retrieval-strategies',
        error: error.message,
      });
    }
  }

  // Filter low-quality chunks (Phase 4 + Phase 5: code filtering)
  docs = filterLowQualityChunks(docs, { query });

  // Context expansion - fetch sibling chunks for better context
  if (EXPANSION_CONFIG.enabled && workspaceId && docs.length > 0) {
    try {
      const expansionResult = await expandDocumentContext(docs, workspaceId, {
        windowSize: 1,
        maxChunksPerSource: 3,
      });
      if (expansionResult.metrics.expanded) {
        docs = expansionResult.chunks;
        logger.debug('Context expansion applied', {
          service: 'retrieval-strategies',
          originalCount: expansionResult.metrics.originalCount,
          expandedCount: expansionResult.metrics.expandedCount,
        });
      }
    } catch (error) {
      logger.warn('Context expansion failed, using original docs', {
        service: 'retrieval-strategies',
        error: error.message,
      });
    }
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
      contextExpanded: EXPANSION_CONFIG.enabled,
      crossEncoderApplied: RERANK_CONFIG.enabled,
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

  // Filter low-quality chunks (Phase 4 + Phase 5: code filtering)
  docs = filterLowQualityChunks(docs, { query });

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

  // Filter low-quality chunks (Phase 4 + Phase 5: code filtering)
  docs = filterLowQualityChunks(docs, { query });

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

  // Filter low-quality chunks (Phase 4 + Phase 5: code filtering)
  docs = filterLowQualityChunks(docs, { query });

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
export async function noRetrieval(_query, _config) {
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

/**
 * Advanced retrieval enhancement techniques for RAG
 * Includes query expansion, HyDE, and contextual compression
 *
 * SECURITY FIX (GAP 34): Added caching to prevent redundant LLM calls
 * @module services/rag/retrievalEnhancements
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createHash } from 'crypto';
import { getDefaultLLM } from '../../config/llm.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} timestamp - When the entry was created (ms since epoch)
 */

/**
 * @typedef {Object} CacheStats
 * @property {number} size - Current number of entries
 * @property {number} maxSize - Maximum capacity
 * @property {number} ttlMs - Time-to-live in milliseconds
 */

/**
 * @typedef {Object} ExpansionCacheStats
 * @property {CacheStats} queryExpansion - Query expansion cache stats
 * @property {CacheStats} hyde - HyDE cache stats
 */

/**
 * @typedef {Object} Document
 * @property {string} pageContent - Document text content
 * @property {Object} [metadata] - Document metadata
 * @property {number} [metadata.originalLength] - Original content length
 * @property {number} [metadata.compressedLength] - Compressed content length
 * @property {boolean} [metadata.compressed] - Whether content was compressed
 */

/**
 * @typedef {Object} CompressionStats
 * @property {number} totalDocs - Total documents processed
 * @property {number} compressed - Number successfully compressed
 * @property {number} avgReduction - Average size reduction percentage
 */

// Chains are initialized lazily
let queryExpansionChain = null;
let hydeChain = null;
let compressionChain = null;
let cachedLLM = null;

/**
 * Get the LLM instance (cached after first fetch)
 */
async function getLLMInstance() {
  if (!cachedLLM) {
    cachedLLM = await getDefaultLLM();
  }
  return cachedLLM;
}

/**
 * Simple LRU Cache for query expansion and HyDE results
 * SECURITY FIX (GAP 34): Cache LLM results to reduce costs and prevent DDoS
 * @class
 */
class ExpansionCache {
  /**
   * Create a new ExpansionCache
   * @param {number} [maxSize=500] - Maximum number of entries
   * @param {number} [ttlMs=300000] - Time-to-live in milliseconds (default 5 min)
   */
  constructor(maxSize = 500, ttlMs = 5 * 60 * 1000) {
    // 5 minute TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Hash a key for cache storage
   * @param {string} key - Key to hash
   * @returns {string} 16-character hash
   * @private
   */
  _hash(key) {
    return createHash('sha256').update(key.toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null if not found/expired
   */
  get(key) {
    const hash = this._hash(key);
    const entry = this.cache.get(hash);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(hash);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(hash);
    this.cache.set(hash, entry);

    return entry.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    const hash = this._hash(key);

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(hash, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all entries from cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries in cache
   */
  get size() {
    return this.cache.size;
  }
}

// Caches for expansion results
const queryExpansionCache = new ExpansionCache(500, 5 * 60 * 1000); // 5 min TTL
const hydeCache = new ExpansionCache(500, 5 * 60 * 1000); // 5 min TTL

/**
 * Initialize the query expansion chain
 */
async function initQueryExpansionChain() {
  if (queryExpansionChain) return queryExpansionChain;

  const llm = await getLLMInstance();
  const queryExpansionPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Generate 2 alternative phrasings of the following question to improve search coverage.
Generate alternatives in the SAME LANGUAGE as the original question.
Return ONLY the alternative questions, one per line, without numbering or explanations.

Example (English):
Original: "What are AI agents?"
Alternative 1: "Define AI agent systems"
Alternative 2: "Characteristics of autonomous agents"

Example (French):
Original: "Liste de document demande titre de séjour"
Alternative 1: "Documents nécessaires pour un titre de séjour"
Alternative 2: "Pièces justificatives demande carte de séjour"`,
    ],
    ['user', '{question}'],
  ]);

  queryExpansionChain = queryExpansionPrompt.pipe(llm).pipe(new StringOutputParser());
  return queryExpansionChain;
}

/**
 * Initialize the HyDE chain
 */
async function initHydeChain() {
  if (hydeChain) return hydeChain;

  const llm = await getLLMInstance();
  const hydePrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Generate a hypothetical answer to the following question as if you were answering from a technical document.
Write a concise, factual paragraph (2-3 sentences) that would appear in documentation.
Write the answer in the SAME LANGUAGE as the question.
Do not say "I don't know" - write what a real answer would look like.`,
    ],
    ['user', '{question}'],
  ]);

  hydeChain = hydePrompt.pipe(llm).pipe(new StringOutputParser());
  return hydeChain;
}

/**
 * Initialize the contextual compression chain
 */
async function initCompressionChain() {
  if (compressionChain) return compressionChain;

  const llm = await getLLMInstance();
  const compressionPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Extract ONLY the sentences from the following document that are directly relevant to answering the query.
Return only the extracted sentences, separated by newlines. Do not add any commentary.

Query: {query}

Document:
{document}`,
    ],
  ]);

  compressionChain = compressionPrompt.pipe(llm).pipe(new StringOutputParser());
  return compressionChain;
}

/**
 * Initialize all retrieval enhancement chains
 * Call this during system warm-up for better first-request performance
 */
export async function initChains() {
  await initQueryExpansionChain();
  await initHydeChain();
  await initCompressionChain();
  logger.info('Retrieval enhancement chains initialized', { service: 'rag' });
}

/**
 * Get expansion cache statistics for monitoring
 * @returns {ExpansionCacheStats} Cache statistics for both caches
 */
export function getExpansionCacheStats() {
  return {
    queryExpansion: {
      size: queryExpansionCache.size,
      maxSize: queryExpansionCache.maxSize,
      ttlMs: queryExpansionCache.ttlMs,
    },
    hyde: {
      size: hydeCache.size,
      maxSize: hydeCache.maxSize,
      ttlMs: hydeCache.ttlMs,
    },
  };
}

/**
 * Clear all expansion caches
 * Useful for testing or when documents are updated
 */
export function clearExpansionCaches() {
  queryExpansionCache.clear();
  hydeCache.clear();
  logger.info('Expansion caches cleared', { service: 'rag' });
}

/**
 * Expand query into multiple variations for improved retrieval coverage
 * SECURITY FIX (GAP 34): Added caching to prevent redundant LLM calls
 *
 * @param {string} query - Original query
 * @returns {Promise<string[]>} Array of query variations (original + alternatives, max 3)
 */
export async function expandQuery(query) {
  // Check cache first
  const cached = queryExpansionCache.get(query);
  if (cached) {
    logger.debug('Query expansion cache HIT', {
      service: 'rag',
      cacheSize: queryExpansionCache.size,
    });
    return cached;
  }

  try {
    const chain = await initQueryExpansionChain();
    const alternativeQs = await chain.invoke({ question: query });
    const variations = alternativeQs
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && !q.match(/^(Alternative|Question|\d+\.)/));

    const allQueries = [query, ...variations].slice(0, 3); // Original + top 2 alternatives

    // Cache the result
    queryExpansionCache.set(query, allQueries);

    logger.debug('Query expansion', {
      service: 'rag',
      original: query,
      variations: allQueries,
      cached: false,
    });

    return allQueries;
  } catch (error) {
    logger.warn('Query expansion failed, using original query', {
      service: 'rag',
      error: error.message,
    });
    return [query];
  }
}

/**
 * Generate hypothetical document for HyDE retrieval
 * SECURITY FIX (GAP 34): Added caching to prevent redundant LLM calls
 *
 * @param {string} query - Original query
 * @returns {Promise<string>} - Hypothetical answer
 */
export async function generateHypotheticalDocument(query) {
  // Check cache first
  const cached = hydeCache.get(query);
  if (cached) {
    logger.debug('HyDE cache HIT', {
      service: 'rag',
      cacheSize: hydeCache.size,
    });
    return cached;
  }

  try {
    const chain = await initHydeChain();
    const hypotheticalAnswer = await chain.invoke({ question: query });

    // Cache the result
    hydeCache.set(query, hypotheticalAnswer);

    logger.debug('HyDE hypothetical document', {
      service: 'rag',
      query,
      hypothetical: hypotheticalAnswer.substring(0, 100) + '...',
      cached: false,
    });
    return hypotheticalAnswer;
  } catch (error) {
    logger.warn('HyDE generation failed, using original query', {
      service: 'rag',
      error: error.message,
    });
    return query;
  }
}

/**
 * Compress documents to only relevant content using LLM extraction
 * Only processes top 5 documents to save time and costs
 *
 * @param {Document[]} docs - Documents to compress
 * @param {string} query - User query for relevance filtering
 * @returns {Promise<Document[]>} Compressed documents with metadata about compression
 */
export async function compressDocuments(docs, query) {
  // Patterns that indicate LLM returned a disclaimer instead of actual extracted content
  const LLM_DISCLAIMER_PATTERNS = [
    /trained on data/i,
    /knowledge cutoff/i,
    /i don'?t have (access|information)/i,
    /cannot (find|extract|identify)/i,
    /no relevant (sentences|information|content)/i,
    /as an ai/i,
  ];

  /**
   * Check if compressed content is a valid extraction (not an LLM disclaimer)
   */
  function isValidCompression(compressed, original) {
    if (!compressed || compressed.trim().length < 20) return false;
    // Reject LLM disclaimers
    if (LLM_DISCLAIMER_PATTERNS.some((p) => p.test(compressed))) return false;
    // Reject if compressed is significantly longer than original (shouldn't happen)
    if (compressed.length > original.length * 1.2) return false;
    return true;
  }

  try {
    const chain = await initCompressionChain();
    const compressedDocs = await Promise.all(
      docs.slice(0, 5).map(async (doc) => {
        // Only compress top 5 to save time
        const originalContent = doc.pageContent;

        try {
          const compressed = await chain.invoke({
            query,
            document: originalContent.substring(0, 1500), // Limit input length
          });

          // Validate compression result - reject LLM disclaimers
          const useCompressed = isValidCompression(compressed, originalContent);
          const finalContent = useCompressed ? compressed : originalContent;

          return {
            ...doc,
            pageContent: finalContent,
            metadata: {
              ...doc.metadata,
              // Always preserve original for source display
              _originalContent: originalContent,
              compressed: useCompressed,
              originalLength: originalContent.length,
              compressedLength: finalContent.length,
            },
          };
        } catch (err) {
          logger.debug('Compression failed for document, using original', {
            service: 'rag',
            error: err.message,
          });
          return {
            ...doc,
            metadata: {
              ...doc.metadata,
              _originalContent: originalContent,
            },
          };
        }
      })
    );

    const compressionStats = {
      totalDocs: compressedDocs.length,
      compressed: compressedDocs.filter((d) => d.metadata?.compressed).length,
      avgReduction:
        compressedDocs.reduce((sum, d) => {
          if (d.metadata?.compressed) {
            return (
              sum +
              ((d.metadata.originalLength - d.metadata.compressedLength) /
                d.metadata.originalLength) *
                100
            );
          }
          return sum;
        }, 0) / compressedDocs.filter((d) => d.metadata?.compressed).length || 0,
    };

    logger.info('Contextual compression applied', {
      service: 'rag',
      ...compressionStats,
      avgReductionPct: compressionStats.avgReduction.toFixed(1) + '%',
    });

    return compressedDocs;
  } catch (error) {
    logger.warn('Contextual compression failed, using original docs', {
      service: 'rag',
      error: error.message,
    });
    return docs;
  }
}

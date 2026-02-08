/**
 * Chunk Quality Filter (Phase 4 + Phase 5)
 * Post-rerank filtering to remove low-quality chunks before LLM context
 *
 * Phase 5 additions:
 * - Code chunk filtering based on query intent
 *
 * @module services/rag/chunkFilter
 */

import logger from '../../config/logger.js';

/**
 * Minimum token threshold for a chunk to be considered valid
 * Chunks below this are dropped unless they're the sole representative of their section
 */
const MIN_TOKEN_THRESHOLD = 50;

/**
 * Junk patterns that indicate navigation/structural content rather than useful information
 * These patterns are checked against the start of the pageContent (case-insensitive)
 */
const JUNK_PATTERNS = [
  /^\[Table of Contents\]/i,
  /^\[Breadcrumb\]/i,
  /^\[Link to page\]/i,
  /^---+\s*$/,
  /^(---+\s*)+$/,
];

/**
 * Phase 5: Programming-related keywords for code chunk filtering
 * If query contains these keywords, code chunks are included
 */
const PROGRAMMING_KEYWORDS = new Set([
  // Languages
  'javascript',
  'typescript',
  'python',
  'java',
  'sql',
  'bash',
  'shell',
  'ruby',
  'go',
  'golang',
  'rust',
  'php',
  'c++',
  'csharp',
  'swift',
  'kotlin',
  // Concepts
  'code',
  'function',
  'api',
  'implement',
  'implementation',
  'script',
  'example',
  'snippet',
  'syntax',
  'method',
  'class',
  'variable',
  'endpoint',
  'sdk',
  'library',
  'module',
  'import',
  'export',
  'debug',
  'error',
  'exception',
  'bug',
  'fix',
  // Actions
  'show me',
  'how to',
  'write',
  'create',
  'build',
  'run',
  'execute',
  'call',
  'invoke',
  'deploy',
  'install',
  'configure',
  'setup',
  'integrate',
]);

/**
 * Phase 5: Check if query is programming-related
 *
 * @param {string} query - User query
 * @returns {boolean} True if query is programming-related
 */
function isProgrammingQuery(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const lowerQuery = query.toLowerCase();

  // Check for programming keywords
  for (const keyword of PROGRAMMING_KEYWORDS) {
    if (lowerQuery.includes(keyword)) {
      return true;
    }
  }

  // Check for code-related patterns
  const codePatterns = [
    /\bcode\b/i,
    /\bscript\b/i,
    /\bfunction\s*\(/i,
    /how\s+(do|to|can)\s+(i|we|you)\s+(write|create|implement)/i,
    /show\s+(me\s+)?(the\s+)?(code|implementation|example)/i,
    /\bprogramm(ing|atically)\b/i,
  ];

  return codePatterns.some((pattern) => pattern.test(lowerQuery));
}

/**
 * Estimate token count for a document
 * Uses metadata.estimatedTokens if available, otherwise approximates as length/4
 *
 * @param {Object} doc - Document with pageContent and metadata
 * @returns {number} Estimated token count
 */
function estimateTokens(doc) {
  if (doc.metadata?.estimatedTokens) {
    return doc.metadata.estimatedTokens;
  }
  return Math.ceil((doc.pageContent?.length || 0) / 4);
}

/**
 * Check if document content matches any junk pattern
 *
 * @param {string} content - Document content
 * @returns {boolean} True if content matches a junk pattern
 */
function isJunkContent(content) {
  if (!content) return false;
  const trimmed = content.trim();
  return JUNK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Get the top-level heading (section) for a document
 *
 * @param {Object} doc - Document with metadata
 * @returns {string|null} Top-level heading or null
 */
function getTopLevelHeading(doc) {
  const headingPath = doc.metadata?.heading_path;
  if (Array.isArray(headingPath) && headingPath.length > 0) {
    return headingPath[0];
  }
  return null;
}

/**
 * Build a map of top-level headings to their document counts
 *
 * @param {Array} docs - Array of documents
 * @returns {Map<string, number>} Heading to count map
 */
function buildHeadingCountMap(docs) {
  const countMap = new Map();
  for (const doc of docs) {
    const heading = getTopLevelHeading(doc);
    if (heading) {
      countMap.set(heading, (countMap.get(heading) || 0) + 1);
    }
  }
  return countMap;
}

/**
 * Filter out low-quality chunks from retrieval results
 *
 * This filter runs after reranking but before LLM context construction.
 * It removes:
 * - Tiny chunks (<50 tokens) unless they're the sole representative of their section
 * - Junk content (navigation, breadcrumbs, separators)
 * - Code chunks when query is not programming-related (Phase 5)
 *
 * Kill-switches:
 * - Set ENABLE_CHUNK_FILTER=false to disable all filtering
 * - Set ENABLE_CODE_FILTER=false to disable code filtering only
 *
 * @param {Array} docs - Retrieved and reranked documents
 * @param {Object} options - Optional configuration
 * @param {string} [options.query] - The user query (for code filtering)
 * @returns {Array} Filtered documents (minimum 1 returned)
 */
export function filterLowQualityChunks(docs, options = {}) {
  // Kill-switch: return docs unchanged if filtering is disabled
  if (process.env.ENABLE_CHUNK_FILTER === 'false') {
    logger.debug('Chunk filter disabled via ENABLE_CHUNK_FILTER=false', {
      service: 'chunk-filter',
      inputCount: docs?.length || 0,
    });
    return docs;
  }

  if (!docs || docs.length === 0) {
    return [];
  }

  // Phase 5: Code filtering setup
  const { query = '' } = options;
  const enableCodeFilter = process.env.ENABLE_CODE_FILTER !== 'false';
  const isProgramming = query ? isProgrammingQuery(query) : true; // Default to including code if no query

  // Build heading count map for diversity preservation
  const headingCounts = buildHeadingCountMap(docs);

  // Track filtered docs and reasons
  const filtered = [];
  const dropped = [];

  for (const doc of docs) {
    const tokens = estimateTokens(doc);
    const heading = getTopLevelHeading(doc);
    const isSoleRepresentative = heading && headingCounts.get(heading) === 1;
    const isJunk = isJunkContent(doc.pageContent);
    const isTiny = tokens < MIN_TOKEN_THRESHOLD;
    const isCode = doc.metadata?.is_code === true;

    // Determine if this doc should be kept
    let keep = true;
    let reason = null;

    // Junk content is always dropped (navigation, breadcrumbs, separators have no value)
    if (isJunk) {
      keep = false;
      reason = 'junk_pattern';
    } else if (isTiny && !isSoleRepresentative) {
      // Tiny chunks are dropped UNLESS they're the sole representative of their section
      keep = false;
      reason = 'below_token_threshold';
    } else if (enableCodeFilter && isCode && !isProgramming) {
      // Phase 5: Filter code chunks when query is not programming-related
      keep = false;
      reason = 'code_not_relevant';
    }

    if (keep) {
      filtered.push(doc);
    } else {
      dropped.push({ doc, reason, tokens, heading });
    }
  }

  // Minimum output guarantee: always return at least 1 doc
  if (filtered.length === 0 && docs.length > 0) {
    // Return the best-scoring doc from original input
    const bestDoc = docs.reduce((best, current) => {
      const bestScore = best.metadata?.score || best.rrfScore || 0;
      const currentScore = current.metadata?.score || current.rrfScore || 0;
      return currentScore > bestScore ? current : best;
    }, docs[0]);

    logger.warn('All chunks filtered, returning best-scoring fallback', {
      service: 'chunk-filter',
      originalCount: docs.length,
      fallbackScore: bestDoc.metadata?.score || bestDoc.rrfScore,
    });

    return [bestDoc];
  }

  if (dropped.length > 0) {
    logger.debug('Chunk filter results', {
      service: 'chunk-filter',
      inputCount: docs.length,
      outputCount: filtered.length,
      droppedCount: dropped.length,
      droppedReasons: dropped.reduce((acc, d) => {
        acc[d.reason] = (acc[d.reason] || 0) + 1;
        return acc;
      }, {}),
    });
  }

  return filtered;
}

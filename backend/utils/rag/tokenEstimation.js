/**
 * Token Estimation Utilities (Phase 5)
 *
 * Provides accurate token estimation for text chunking.
 * Uses language-aware heuristics by default with optional tiktoken accuracy.
 *
 * @module utils/rag/tokenEstimation
 */

import logger from '../../config/logger.js';

/**
 * Character-per-token ratios for different content types
 * These are empirically derived from various text corpora
 */
const CHARS_PER_TOKEN = {
  english: 4.5, // Standard English prose
  code: 3.0, // Programming code (more special chars, shorter words)
  cjk: 1.5, // Chinese, Japanese, Korean (single char often = 1+ tokens)
  mixed: 4.0, // Mixed content fallback
};

/**
 * Regex patterns for content type detection
 */
const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
const CODE_PATTERN =
  /^```|function\s|const\s|let\s|var\s|import\s|export\s|class\s|def\s|return\s|if\s*\(|for\s*\(|while\s*\(/;

/**
 * Cached tiktoken encoder instance
 * @type {Object|null}
 */
let cachedEncoder = null;
let encoderLoadFailed = false;

/**
 * Detect content type for character ratio selection
 *
 * @param {string} text - Text to analyze
 * @returns {'english'|'code'|'cjk'|'mixed'} Content type
 */
function detectContentType(text) {
  if (!text || typeof text !== 'string') {
    return 'mixed';
  }

  // Check for CJK characters
  const cjkMatches = text.match(CJK_PATTERN);
  if (cjkMatches && cjkMatches.length > text.length * 0.1) {
    return 'cjk';
  }

  // Check for code patterns
  if (CODE_PATTERN.test(text)) {
    return 'code';
  }

  // Check for high special character density (likely code)
  const specialChars = text.match(/[{}()[\]<>;:=+\-*/%&|^!~]/g);
  if (specialChars && specialChars.length > text.length * 0.05) {
    return 'code';
  }

  return 'english';
}

/**
 * Estimate token count using language-aware heuristics
 * Fast estimation with ~15% error margin
 *
 * @param {string} text - Text to estimate tokens for
 * @param {Object} options - Options
 * @param {string} [options.contentType] - Override content type detection ('english', 'code', 'cjk', 'mixed')
 * @returns {number} Estimated token count
 */
export function estimateTokens(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const contentType = options.contentType || detectContentType(text);
  const charsPerToken = CHARS_PER_TOKEN[contentType] || CHARS_PER_TOKEN.mixed;

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Load tiktoken encoder (lazy, cached)
 *
 * @returns {Promise<Object|null>} Tiktoken encoder or null if unavailable
 */
async function loadEncoder() {
  if (cachedEncoder) {
    return cachedEncoder;
  }

  if (encoderLoadFailed) {
    return null;
  }

  try {
    // Use js-tiktoken (already available via LangChain)
    const { encodingForModel, getEncoding } = await import('js-tiktoken');

    // Try to get cl100k_base encoding (used by GPT-4, similar to most models)
    try {
      cachedEncoder = getEncoding('cl100k_base');
    } catch {
      // Fallback to GPT-3.5 encoding
      cachedEncoder = encodingForModel('gpt-3.5-turbo');
    }

    logger.debug('Tiktoken encoder loaded successfully', {
      service: 'token-estimation',
    });

    return cachedEncoder;
  } catch (error) {
    encoderLoadFailed = true;
    logger.warn('Failed to load tiktoken encoder, using heuristics only', {
      service: 'token-estimation',
      error: error.message,
    });
    return null;
  }
}

/**
 * Estimate token count using tiktoken (accurate)
 * Falls back to heuristic estimation if tiktoken is unavailable
 *
 * @param {string} text - Text to estimate tokens for
 * @returns {Promise<number>} Token count
 */
export async function estimateTokensAccurate(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Check if tiktoken is enabled via environment variable
  const useTiktoken = process.env.USE_TIKTOKEN !== 'false';

  if (!useTiktoken) {
    return estimateTokens(text);
  }

  try {
    const encoder = await loadEncoder();

    if (!encoder) {
      // Fallback to heuristic
      return estimateTokens(text);
    }

    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    logger.debug('Tiktoken encoding failed, using heuristic', {
      service: 'token-estimation',
      error: error.message,
    });
    return estimateTokens(text);
  }
}

/**
 * Batch estimate tokens for multiple texts
 * Uses accurate estimation if tiktoken is enabled and available
 *
 * @param {string[]} texts - Array of texts to estimate
 * @param {Object} options - Options
 * @param {boolean} [options.accurate=false] - Use tiktoken for accuracy
 * @returns {Promise<number[]>} Array of token counts
 */
export async function estimateTokensBatch(texts, options = {}) {
  if (!Array.isArray(texts)) {
    return [];
  }

  const { accurate = false } = options;

  if (!accurate) {
    return texts.map((text) => estimateTokens(text));
  }

  // Load encoder once for batch
  const encoder = await loadEncoder();

  if (!encoder) {
    // Fallback to heuristics
    return texts.map((text) => estimateTokens(text));
  }

  return texts.map((text) => {
    try {
      if (!text || typeof text !== 'string') return 0;
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch {
      return estimateTokens(text);
    }
  });
}

/**
 * Get the character-per-token ratio for a content type
 *
 * @param {string} contentType - Content type
 * @returns {number} Characters per token ratio
 */
export function getCharsPerToken(contentType = 'english') {
  return CHARS_PER_TOKEN[contentType] || CHARS_PER_TOKEN.mixed;
}

/**
 * Detect content type from text
 *
 * @param {string} text - Text to analyze
 * @returns {string} Content type
 */
export { detectContentType };

export default {
  estimateTokens,
  estimateTokensAccurate,
  estimateTokensBatch,
  getCharsPerToken,
  detectContentType,
};

/**
 * Citation Validation Utility
 *
 * Validates [Source N] citations in LLM responses to ensure:
 * - All cited source numbers exist in the provided sources
 * - Citations follow the correct format
 * - Orphan citations are detected and optionally corrected
 *
 * @module utils/rag/citationValidator
 */

import logger from '../../config/logger.js';

// Inline citation validation config (guardrails.js removed in MVP)
const guardrailsConfig = {
  output: {
    citationValidation: {
      maxOrphanCitations: 0,
      minCitationCoverage: 0.3,
    },
  },
};

/**
 * Citation validation result
 * @typedef {Object} CitationValidationResult
 * @property {boolean} valid - Whether all citations are valid
 * @property {string} text - Processed text (with invalid citations removed/corrected)
 * @property {number[]} validCitations - Array of valid source numbers found
 * @property {number[]} invalidCitations - Array of invalid source numbers found
 * @property {number} totalCitations - Total number of citations found
 * @property {string[]} issues - List of validation issues
 * @property {boolean} modified - Whether the text was modified
 */

/**
 * Extract all [Source N] citations from text
 * @param {string} text - Text to search
 * @returns {Array<{match: string, number: number, index: number}>} Array of citation matches
 */
export function extractCitations(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const citations = [];
  // Match [Source N], [Source N, M], [Sources N, M], [Source N-M] patterns
  const pattern = /\[Sources?\s*(\d+(?:\s*[-,]\s*\d+)*)\]/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const numbersStr = match[1];
    // Parse numbers from formats like "1, 2, 3" or "1-3" or "1"
    const numbers = parseSourceNumbers(numbersStr);

    for (const num of numbers) {
      citations.push({
        match: match[0],
        number: num,
        index: match.index,
      });
    }
  }

  return citations;
}

/**
 * Parse source numbers from citation content
 * Handles: "1", "1, 2, 3", "1-3", "1, 3-5"
 * @param {string} numbersStr - Numbers string from citation
 * @returns {number[]} Array of source numbers
 */
function parseSourceNumbers(numbersStr) {
  const numbers = [];
  const parts = numbersStr.split(/\s*,\s*/);

  for (const part of parts) {
    const trimmed = part.trim();

    // Check for range (e.g., "1-3")
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end && i <= start + 10; i++) {
        // Limit range to 10 to prevent abuse
        numbers.push(i);
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  return numbers;
}

/**
 * Validate citations in text against provided sources
 *
 * @param {string} text - Text containing citations
 * @param {Array} sources - Array of source objects
 * @param {Object} options - Validation options
 * @param {boolean} options.removeInvalid - Remove invalid citations from text
 * @param {boolean} options.logWarnings - Log warnings for invalid citations
 * @param {number} options.maxOrphanCitations - Max allowed orphan citations (default from guardrails)
 * @returns {CitationValidationResult} Validation result
 */
export function validateCitations(text, sources, options = {}) {
  const {
    removeInvalid = true,
    logWarnings = true,
    maxOrphanCitations = guardrailsConfig.output.citationValidation.maxOrphanCitations,
  } = options;

  const result = {
    valid: true,
    text: text,
    validCitations: [],
    invalidCitations: [],
    totalCitations: 0,
    issues: [],
    modified: false,
  };

  if (!text || typeof text !== 'string') {
    return result;
  }

  const maxSourceNumber = sources?.length || 0;
  const citations = extractCitations(text);
  result.totalCitations = citations.length;

  // Categorize citations as valid or invalid
  const validNumbers = new Set();
  const invalidNumbers = new Set();

  for (const citation of citations) {
    if (citation.number >= 1 && citation.number <= maxSourceNumber) {
      validNumbers.add(citation.number);
    } else {
      invalidNumbers.add(citation.number);
    }
  }

  result.validCitations = Array.from(validNumbers).sort((a, b) => a - b);
  result.invalidCitations = Array.from(invalidNumbers).sort((a, b) => a - b);

  // Check for orphan citations
  if (result.invalidCitations.length > 0) {
    result.valid = false;
    result.issues.push(
      `Found ${result.invalidCitations.length} orphan citation(s): [Source ${result.invalidCitations.join(', ')}] (max sources: ${maxSourceNumber})`
    );

    if (logWarnings) {
      logger.warn('Invalid citations detected in LLM output', {
        service: 'citation-validator',
        invalidCitations: result.invalidCitations,
        maxSourceNumber,
        totalCitations: result.totalCitations,
      });
    }

    // Remove or mark invalid citations if requested
    if (removeInvalid && result.invalidCitations.length > maxOrphanCitations) {
      result.text = removeInvalidCitations(text, result.invalidCitations);
      result.modified = true;
    }
  }

  return result;
}

/**
 * Remove invalid citations from text
 * @param {string} text - Text with citations
 * @param {number[]} invalidNumbers - Invalid source numbers to remove
 * @returns {string} Text with invalid citations removed
 */
function removeInvalidCitations(text, invalidNumbers) {
  if (!invalidNumbers || invalidNumbers.length === 0) {
    return text;
  }

  let result = text;

  // Build pattern to match any of the invalid numbers
  for (const num of invalidNumbers) {
    // Remove [Source N] for specific invalid number
    const singlePattern = new RegExp(`\\[Source\\s+${num}\\]`, 'gi');
    result = result.replace(singlePattern, '');

    // For citations with multiple numbers, remove just the invalid number
    // e.g., [Source 1, 99, 3] -> [Source 1, 3]
    const multiPattern = new RegExp(`(\\[Sources?\\s+[\\d,\\s-]*),?\\s*${num}\\s*,?`, 'gi');
    result = result.replace(multiPattern, '$1');
  }

  // Clean up empty citations and double spaces
  result = result.replace(/\[Sources?\s*\]/gi, '');
  result = result.replace(/\s{2,}/g, ' ');

  return result.trim();
}

/**
 * Ensure answer has proper citation format
 * Converts common malformed patterns to standard [Source N] format
 *
 * @param {string} text - Text to normalize
 * @returns {string} Text with normalized citations
 */
export function normalizeCitationFormat(text) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let result = text;

  // Convert (Source N) to [Source N]
  result = result.replace(/\(Source\s+(\d+)\)/gi, '[Source $1]');

  // Convert {Source N} to [Source N]
  result = result.replace(/\{Source\s+(\d+)\}/gi, '[Source $1]');

  // Convert Source: N to [Source N]
  result = result.replace(/Source:\s*(\d+)/gi, '[Source $1]');

  // Convert [N] (bare number in brackets) to [Source N] if near context
  // Only if it looks like a citation (after a statement)
  result = result.replace(/(\.\s*)\[(\d+)\](?!\()/g, '$1[Source $2]');

  return result;
}

/**
 * Full citation processing pipeline
 * 1. Normalize format
 * 2. Validate against sources
 * 3. Remove orphan citations
 *
 * @param {string} text - LLM response text
 * @param {Array} sources - Available sources
 * @param {Object} options - Processing options
 * @returns {CitationValidationResult} Processed result
 */
export function processCitations(text, sources, options = {}) {
  // Step 1: Normalize citation format
  const normalizedText = normalizeCitationFormat(text);

  // Step 2: Validate and clean citations
  const validationResult = validateCitations(normalizedText, sources, {
    removeInvalid: options.removeInvalid ?? true,
    logWarnings: options.logWarnings ?? true,
    maxOrphanCitations: options.maxOrphanCitations,
  });

  // Track if normalization changed the text
  if (normalizedText !== text) {
    validationResult.modified = true;
  }

  return validationResult;
}

/**
 * Check citation coverage in answer
 * Returns ratio of sentences with citations
 *
 * @param {string} text - Answer text
 * @returns {Object} Coverage analysis
 */
export function analyzeCitationCoverage(text) {
  if (!text || typeof text !== 'string') {
    return { coverage: 0, totalSentences: 0, citedSentences: 0 };
  }

  // Split into sentences (simple heuristic)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  const totalSentences = sentences.length;

  if (totalSentences === 0) {
    return { coverage: 1, totalSentences: 0, citedSentences: 0 };
  }

  // Count sentences with citations
  const citedSentences = sentences.filter((s) => /\[Sources?\s+\d+/i.test(s)).length;
  const coverage = citedSentences / totalSentences;

  return {
    coverage,
    totalSentences,
    citedSentences,
    meetsCoverage: coverage >= guardrailsConfig.output.citationValidation.minCitationCoverage,
  };
}

export default {
  extractCitations,
  validateCitations,
  normalizeCitationFormat,
  processCitations,
  analyzeCitationCoverage,
};

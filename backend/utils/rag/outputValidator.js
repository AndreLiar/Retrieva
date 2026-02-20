/**
 * LLM Output Schema Validator
 *
 * Enforces output schema validation for main LLM generation responses.
 * Ensures answers meet minimum quality and format standards before
 * being processed further.
 *
 * @module utils/rag/outputValidator
 */

import { z } from 'zod';
import logger from '../../config/logger.js';
import { guardrailsConfig } from '../../config/guardrails.js';

/**
 * RAG answer output schema
 * Defines the expected structure and constraints for LLM-generated answers
 */
export const ragAnswerSchema = z.object({
  // Content constraints
  content: z
    .string()
    .min(10, 'Answer is too short')
    .max(guardrailsConfig.output.maxResponseLength, 'Answer exceeds maximum length'),

  // Metadata (optional, added during processing)
  metadata: z
    .object({
      hasContent: z.boolean().default(true),
      citationCount: z.number().int().min(0).default(0),
      wordCount: z.number().int().min(0).default(0),
      characterCount: z.number().int().min(0).default(0),
    })
    .optional(),
});

/**
 * Validation result type
 * @typedef {Object} OutputValidationResult
 * @property {boolean} valid - Whether the output passed validation
 * @property {string} content - The validated/processed content
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 * @property {Object} metadata - Extracted metadata about the content
 * @property {boolean} modified - Whether content was modified during validation
 */

/**
 * Content quality checks that don't block but should be logged
 */
const QUALITY_CHECKS = [
  {
    name: 'too_short',
    check: (content) => content.length < 50,
    warning: 'Answer is very short and may lack detail',
  },
  {
    name: 'no_citations',
    check: (content) => !/\[Source\s+\d+\]/i.test(content),
    warning: 'Answer contains no source citations',
  },
  {
    name: 'starts_with_apology',
    check: (content) => /^(I'm sorry|I apologize|Unfortunately)/i.test(content.trim()),
    warning: 'Answer starts with an apology which may indicate inability to answer',
  },
  {
    name: 'contains_uncertainty',
    check: (content) =>
      /\b(I don't know|I'm not sure|I cannot|I can't find)\b/i.test(content) &&
      content.length < 200,
    warning: 'Answer expresses uncertainty and is brief',
  },
  {
    name: 'repetitive_content',
    check: (content) => {
      const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      if (sentences.length < 3) return false;
      const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
      return uniqueSentences.size < sentences.length * 0.7;
    },
    warning: 'Answer may contain repetitive content',
  },
  {
    name: 'incomplete_sentence',
    check: (content) => {
      const trimmed = content.trim();
      return trimmed.length > 50 && !/[.!?:"]$/.test(trimmed);
    },
    warning: 'Answer may be incomplete (does not end with punctuation)',
  },
];

/**
 * Patterns that indicate potentially problematic output
 */
const BLOCKED_PATTERNS = [
  {
    pattern: /^```[\s\S]*```$/,
    reason: 'Answer is only a code block without explanation',
  },
  {
    pattern: /^(undefined|null|NaN|error|Error:)$/i,
    reason: 'Answer appears to be an error or undefined value',
  },
  {
    pattern: /^\[object Object\]$/,
    reason: 'Answer is serialized object string',
  },
  {
    pattern: /^<\/?[a-z][\s\S]*>$/i,
    reason: 'Answer appears to be raw HTML/XML',
  },
];

/**
 * Validate LLM output against schema and quality checks
 *
 * @param {string} content - The LLM-generated answer
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, quality warnings become errors
 * @param {boolean} options.allowEmpty - If true, empty content is allowed
 * @param {number} options.minLength - Minimum content length
 * @param {number} options.maxLength - Maximum content length
 * @returns {OutputValidationResult} Validation result
 */
export function validateOutput(content, options = {}) {
  const {
    strict = false,
    allowEmpty = false,
    minLength = 10,
    maxLength = guardrailsConfig.output.maxResponseLength,
  } = options;

  const result = {
    valid: true,
    content: content || '',
    errors: [],
    warnings: [],
    metadata: {
      hasContent: false,
      citationCount: 0,
      wordCount: 0,
      characterCount: 0,
    },
    modified: false,
  };

  // Handle null/undefined
  if (content === null || content === undefined) {
    if (!allowEmpty) {
      result.valid = false;
      result.errors.push('Answer content is null or undefined');
    }
    return result;
  }

  // Ensure string type
  if (typeof content !== 'string') {
    result.valid = false;
    result.errors.push(`Answer must be a string, got ${typeof content}`);
    result.content = String(content);
    result.modified = true;
    return result;
  }

  // Trim whitespace
  const trimmedContent = content.trim();
  if (trimmedContent !== content) {
    result.content = trimmedContent;
    result.modified = true;
  }

  // Check for empty content
  if (trimmedContent.length === 0) {
    if (!allowEmpty) {
      result.valid = false;
      result.errors.push('Answer content is empty');
    }
    return result;
  }

  result.metadata.hasContent = true;
  result.metadata.characterCount = trimmedContent.length;
  result.metadata.wordCount = trimmedContent.split(/\s+/).length;

  // Count citations
  const citations = trimmedContent.match(/\[Source\s+\d+\]/gi) || [];
  result.metadata.citationCount = citations.length;

  // Check length constraints
  if (trimmedContent.length < minLength) {
    result.valid = false;
    result.errors.push(
      `Answer is too short (${trimmedContent.length} chars, minimum ${minLength})`
    );
  }

  if (trimmedContent.length > maxLength) {
    result.valid = false;
    result.errors.push(
      `Answer exceeds maximum length (${trimmedContent.length} chars, maximum ${maxLength})`
    );
    // Truncate if too long
    result.content = trimmedContent.substring(0, maxLength) + '...';
    result.modified = true;
  }

  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmedContent)) {
      result.valid = false;
      result.errors.push(reason);
    }
  }

  // Run quality checks
  for (const { name: _name, check, warning } of QUALITY_CHECKS) {
    if (check(trimmedContent)) {
      if (strict) {
        result.valid = false;
        result.errors.push(warning);
      } else {
        result.warnings.push(warning);
      }
    }
  }

  // Log validation results if issues found
  if (result.errors.length > 0 || result.warnings.length > 0) {
    logger.info('Output validation completed with issues', {
      service: 'output-validator',
      valid: result.valid,
      errorsCount: result.errors.length,
      warningsCount: result.warnings.length,
      contentLength: trimmedContent.length,
      citationCount: result.metadata.citationCount,
    });
  }

  return result;
}

/**
 * Validate output using Zod schema
 *
 * @param {string} content - Content to validate
 * @returns {Object} Zod validation result
 */
export function validateWithSchema(content) {
  const data = {
    content: content || '',
    metadata: {
      hasContent: Boolean(content && content.trim().length > 0),
      citationCount: ((content || '').match(/\[Source\s+\d+\]/gi) || []).length,
      wordCount: (content || '').split(/\s+/).filter(Boolean).length,
      characterCount: (content || '').length,
    },
  };

  return ragAnswerSchema.safeParse(data);
}

/**
 * Process and validate LLM output with automatic corrections
 *
 * @param {string} content - Raw LLM output
 * @param {Object} options - Processing options
 * @returns {OutputValidationResult} Processed result
 */
export function processOutput(content, options = {}) {
  let processed = content;
  let modified = false;

  // Step 1: Basic cleanup
  if (typeof processed === 'string') {
    // Remove common LLM artifacts
    const before = processed;

    // Remove trailing "assistant:" or similar role markers
    processed = processed.replace(/^(assistant|ai|bot):\s*/i, '');

    // Remove trailing incomplete markers
    processed = processed.replace(/\[?(incomplete|continued|truncated)\]?\s*$/i, '');

    // Remove multiple consecutive newlines (keep max 2)
    processed = processed.replace(/\n{3,}/g, '\n\n');

    if (processed !== before) {
      modified = true;
    }
  }

  // Step 2: Validate
  const validation = validateOutput(processed, options);

  if (validation.modified) {
    modified = true;
  }

  return {
    ...validation,
    content: validation.content,
    modified,
  };
}

/**
 * Check if output requires retry based on validation
 *
 * @param {OutputValidationResult} validation - Validation result
 * @param {Object} options - Check options
 * @returns {boolean} Whether retry is recommended
 */
export function shouldRetryOutput(validation, options = {}) {
  const { retryOnWarnings = false, maxWarningsBeforeRetry = 2 } = options;

  // Always retry on errors
  if (!validation.valid || validation.errors.length > 0) {
    return true;
  }

  // Optionally retry on too many warnings
  if (retryOnWarnings && validation.warnings.length >= maxWarningsBeforeRetry) {
    return true;
  }

  return false;
}

export default {
  ragAnswerSchema,
  validateOutput,
  validateWithSchema,
  processOutput,
  shouldRetryOutput,
};

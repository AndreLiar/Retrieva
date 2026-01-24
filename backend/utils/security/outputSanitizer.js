/**
 * Output Sanitization Utility
 *
 * SECURITY FIX (LLM02): Sanitizes LLM outputs before sending to clients
 * to prevent XSS, code injection, and other output-based attacks.
 *
 * This utility should be applied to all LLM responses before:
 * - Rendering in web browsers
 * - Storing in databases
 * - Passing to other systems
 */

import logger from '../../config/logger.js';

/**
 * HTML entities that need escaping for XSS prevention
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Dangerous patterns that should be removed or neutralized
 */
const DANGEROUS_PATTERNS = [
  // Script injection
  {
    pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    replacement: '[script removed]',
  },
  { pattern: /<script[^>]*>/gi, replacement: '[script removed]' },

  // Event handlers (onclick, onerror, onload, etc.)
  { pattern: /\bon\w+\s*=/gi, replacement: 'data-blocked=' },

  // JavaScript URIs
  { pattern: /javascript\s*:/gi, replacement: 'blocked:' },
  { pattern: /vbscript\s*:/gi, replacement: 'blocked:' },
  { pattern: /data\s*:\s*text\/html/gi, replacement: 'blocked:' },

  // HTML injection via attributes
  { pattern: /<iframe[^>]*>/gi, replacement: '[iframe removed]' },
  { pattern: /<object[^>]*>/gi, replacement: '[object removed]' },
  { pattern: /<embed[^>]*>/gi, replacement: '[embed removed]' },
  { pattern: /<form[^>]*>/gi, replacement: '[form removed]' },
  { pattern: /<input[^>]*>/gi, replacement: '[input removed]' },
  { pattern: /<button[^>]*>/gi, replacement: '[button removed]' },

  // Meta refresh/redirect
  { pattern: /<meta[^>]*http-equiv[^>]*refresh[^>]*>/gi, replacement: '[meta refresh removed]' },

  // SVG-based XSS
  { pattern: /<svg[^>]*onload[^>]*>/gi, replacement: '[svg removed]' },
  { pattern: /<svg[^>]*>/gi, replacement: '[svg-start]' },

  // Style-based attacks
  { pattern: /expression\s*\(/gi, replacement: 'blocked(' },
  { pattern: /url\s*\(\s*['"]?\s*javascript/gi, replacement: 'url(blocked' },

  // Base64 encoded content that might be executable
  { pattern: /data:[^;]+;base64,[a-zA-Z0-9+/=]{100,}/gi, replacement: '[base64 content removed]' },
];

/**
 * Patterns to detect in output for logging (not necessarily removed)
 */
const SUSPICIOUS_OUTPUT_PATTERNS = [
  { pattern: /system\s*prompt/gi, category: 'prompt_leak' },
  { pattern: /my\s+instructions?\s+(?:are|say|tell)/gi, category: 'instruction_leak' },
  { pattern: /critical\s+instructions?/gi, category: 'instruction_leak' },
  { pattern: /\[system\]/gi, category: 'system_tag' },
  { pattern: /api[_-]?key\s*[:=]/gi, category: 'credential_pattern' },
  { pattern: /password\s*[:=]/gi, category: 'credential_pattern' },
  { pattern: /-----BEGIN.*KEY-----/gi, category: 'private_key' },
];

/**
 * Encode HTML entities to prevent XSS
 * @param {string} text - Text to encode
 * @returns {string} HTML-encoded text
 */
export function encodeHTMLEntities(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Decode HTML entities (for processing already-encoded content)
 * @param {string} text - Text to decode
 * @returns {string} Decoded text
 */
export function decodeHTMLEntities(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const entityMap = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
    '&#39;': "'",
    '&apos;': "'",
  };

  return text.replace(
    /&(?:amp|lt|gt|quot|#x27|#x2F|#x60|#x3D|#39|apos);/gi,
    (entity) => entityMap[entity.toLowerCase()] || entity
  );
}

/**
 * Remove dangerous HTML/JavaScript patterns from output
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function removeDangerousPatterns(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;
  let patternsRemoved = 0;

  for (const { pattern, replacement } of DANGEROUS_PATTERNS) {
    const before = sanitized;
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, replacement);
    if (sanitized !== before) {
      patternsRemoved++;
    }
  }

  if (patternsRemoved > 0) {
    logger.warn('Dangerous patterns removed from output', {
      service: 'output-sanitizer',
      patternsRemoved,
      textPreview: text.substring(0, 100),
    });
  }

  return sanitized;
}

/**
 * Detect suspicious patterns in output (for logging/alerting)
 * @param {string} text - Text to analyze
 * @returns {Object} Detection result
 */
export function detectSuspiciousOutput(text) {
  if (!text || typeof text !== 'string') {
    return { suspicious: false, categories: [] };
  }

  const detectedCategories = new Set();

  for (const { pattern, category } of SUSPICIOUS_OUTPUT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detectedCategories.add(category);
    }
  }

  const categories = Array.from(detectedCategories);

  if (categories.length > 0) {
    logger.warn('Suspicious patterns detected in LLM output', {
      service: 'output-sanitizer',
      categories,
      textPreview: text.substring(0, 100),
    });
  }

  return {
    suspicious: categories.length > 0,
    categories,
  };
}

/**
 * Sanitize LLM output for safe web rendering
 * This is the main function to use for all LLM outputs
 *
 * @param {string} text - LLM output to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitization result with sanitized text and metadata
 */
export function sanitizeLLMOutput(text, options = {}) {
  const {
    encodeHtml = true, // Encode HTML entities
    removeDangerous = true, // Remove dangerous patterns
    detectSuspicious = true, // Log suspicious patterns
    preserveMarkdown = true, // Try to preserve markdown formatting
  } = options;

  if (!text || typeof text !== 'string') {
    return {
      text: '',
      original: text,
      modified: false,
      suspicious: false,
      categories: [],
    };
  }

  let result = text;
  let wasModified = false;
  let suspiciousResult = { suspicious: false, categories: [] };

  // Step 1: Detect suspicious patterns (before any modification)
  if (detectSuspicious) {
    suspiciousResult = detectSuspiciousOutput(text);
  }

  // Step 2: Remove dangerous patterns
  if (removeDangerous) {
    const before = result;
    result = removeDangerousPatterns(result);
    if (result !== before) {
      wasModified = true;
    }
  }

  // Step 3: Encode HTML entities
  if (encodeHtml) {
    if (preserveMarkdown) {
      // Selective encoding that preserves common markdown
      result = encodeHTMLSelective(result);
    } else {
      const before = result;
      result = encodeHTMLEntities(result);
      if (result !== before) {
        wasModified = true;
      }
    }
  }

  return {
    text: result,
    original: text,
    modified: wasModified,
    suspicious: suspiciousResult.suspicious,
    categories: suspiciousResult.categories,
  };
}

/**
 * Selective HTML encoding that tries to preserve markdown
 * Encodes dangerous characters but allows markdown syntax
 * @param {string} text - Text to encode
 * @returns {string} Selectively encoded text
 */
function encodeHTMLSelective(text) {
  if (!text) return '';

  // Split by code blocks to preserve them
  const codeBlockPattern = /(```[\s\S]*?```|`[^`]+`)/g;
  const parts = text.split(codeBlockPattern);

  return parts
    .map((part, index) => {
      // Odd indices are code blocks - encode fully
      if (index % 2 === 1) {
        // For code blocks, only encode the most dangerous characters
        return part.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      // For regular text, encode HTML but preserve markdown
      return part
        .replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;') // & not already part of entity
        .replace(/<(?!\/?(br|p|strong|em|code|pre|ul|ol|li|blockquote|h[1-6])\b)/gi, '&lt;') // < except safe tags
        .replace(/javascript\s*:/gi, 'blocked:')
        .replace(/on\w+\s*=/gi, 'data-blocked=');
    })
    .join('');
}

/**
 * Sanitize for JSON embedding (prevents JSON injection)
 * @param {string} text - Text to sanitize
 * @returns {string} JSON-safe text
 */
export function sanitizeForJSON(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001F]/g, ''); // Remove control characters
}

/**
 * Sanitize for SQL embedding (basic, should use parameterized queries instead)
 * @param {string} text - Text to sanitize
 * @returns {string} SQL-safe text
 */
export function sanitizeForSQL(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  logger.warn('sanitizeForSQL used - prefer parameterized queries', {
    service: 'output-sanitizer',
  });

  return text
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\')
    .replace(/\x00/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
}

/**
 * Full sanitization pipeline for RAG responses
 * @param {Object} ragResult - RAG result object with answer field
 * @returns {Object} RAG result with sanitized answer
 */
export function sanitizeRAGResponse(ragResult) {
  if (!ragResult || typeof ragResult !== 'object') {
    return ragResult;
  }

  const sanitizedResult = { ...ragResult };

  // Sanitize the main answer
  if (ragResult.answer) {
    const sanitization = sanitizeLLMOutput(ragResult.answer, {
      encodeHtml: true,
      removeDangerous: true,
      detectSuspicious: true,
      preserveMarkdown: true,
    });

    sanitizedResult.answer = sanitization.text;
    sanitizedResult._sanitization = {
      modified: sanitization.modified,
      suspicious: sanitization.suspicious,
      categories: sanitization.categories,
    };
  }

  // Sanitize formatted answer if present
  if (ragResult.formattedAnswer) {
    const sanitization = sanitizeLLMOutput(ragResult.formattedAnswer, {
      encodeHtml: true,
      removeDangerous: true,
      preserveMarkdown: true,
    });
    sanitizedResult.formattedAnswer = sanitization.text;
  }

  return sanitizedResult;
}

export default {
  encodeHTMLEntities,
  decodeHTMLEntities,
  removeDangerousPatterns,
  detectSuspiciousOutput,
  sanitizeLLMOutput,
  sanitizeForJSON,
  sanitizeForSQL,
  sanitizeRAGResponse,
};

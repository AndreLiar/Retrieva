/**
 * Context Sanitization Utility
 *
 * SECURITY FIX (GAP 10): Sanitize retrieved document content before
 * injecting into LLM prompts to prevent prompt injection attacks.
 */

import logger from '../../config/logger.js';

/**
 * Patterns that could indicate prompt injection attempts
 * These patterns are commonly used to manipulate LLM behavior
 */
const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|context|rules)/gi,
  /disregard\s+(the\s+)?(context|instructions|rules|system)/gi,
  /forget\s+(everything|all|what)\s+(you|i)\s+(told|said)/gi,

  // Role manipulation
  /you\s+are\s+now\s+(a|an|the)/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,
  /act\s+as\s+(if|though|a|an)/gi,
  /from\s+now\s+on,?\s+you/gi,

  // System prompt extraction
  /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,
  /show\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,

  // Output manipulation
  /respond\s+(only\s+)?with/gi,
  /your\s+response\s+must\s+(only\s+)?(be|contain|include)/gi,
  /output\s+(only|just)/gi,

  // Jailbreak attempts
  /\bDAN\b/g, // "Do Anything Now"
  /developer\s+mode/gi,
  /jailbreak/gi,

  // Code/command execution attempts
  /<script[\s>]/gi,
  /javascript:/gi,
  /\beval\s*\(/gi,
  /\bexec\s*\(/gi,
];

/**
 * Patterns to detect potentially harmful content in documents
 */
const HARMFUL_CONTENT_PATTERNS = [
  // Base64 encoded content (could hide malicious instructions)
  /data:[a-z]+\/[a-z]+;base64,[a-zA-Z0-9+/=]{100,}/gi,

  // Very long unbroken strings (potential buffer attacks)
  /[^\s]{500,}/g,

  // HTML/XML tags that shouldn't be in document content
  /<(script|iframe|object|embed|form|input|button)[^>]*>/gi,

  // Suspicious markdown that could affect rendering
  /\[([^\]]+)\]\([^)]*javascript:[^)]*\)/gi,
];

/**
 * Check if text contains prompt injection patterns
 * @param {string} text - Text to check
 * @returns {Object} - { hasInjection: boolean, patterns: string[] }
 */
export function detectInjectionPatterns(text) {
  if (!text || typeof text !== 'string') {
    return { hasInjection: false, patterns: [] };
  }

  const detectedPatterns = [];

  for (const pattern of INJECTION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detectedPatterns.push(pattern.source);
    }
  }

  return {
    hasInjection: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}

/**
 * Check if text contains harmful content patterns
 * @param {string} text - Text to check
 * @returns {Object} - { hasHarmful: boolean, issues: string[] }
 */
export function detectHarmfulContent(text) {
  if (!text || typeof text !== 'string') {
    return { hasHarmful: false, issues: [] };
  }

  const issues = [];

  for (const pattern of HARMFUL_CONTENT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      issues.push(`Detected pattern: ${pattern.source.substring(0, 50)}`);
    }
  }

  return {
    hasHarmful: issues.length > 0,
    issues,
  };
}

/**
 * Sanitize text by removing or neutralizing potentially harmful content
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Remove HTML script tags and their content
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '[removed script]');

  // Remove other dangerous HTML tags
  sanitized = sanitized.replace(
    /<(iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi,
    '[removed element]'
  );

  // Neutralize javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, 'javascript-disabled:');

  // Truncate very long unbroken strings
  sanitized = sanitized.replace(/([^\s]{200})[^\s]+/g, '$1...[truncated]');

  // Replace obvious injection attempts with warning markers
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[potential instruction - ignored]');
  }

  return sanitized;
}

/**
 * Sanitize a single document's content
 * @param {Object} doc - Document object with pageContent
 * @returns {Object} - Sanitized document
 */
export function sanitizeDocument(doc) {
  if (!doc || !doc.pageContent) {
    return doc;
  }

  const originalContent = doc.pageContent;
  const injectionCheck = detectInjectionPatterns(originalContent);
  const harmfulCheck = detectHarmfulContent(originalContent);

  // If suspicious content detected, log and sanitize
  if (injectionCheck.hasInjection || harmfulCheck.hasHarmful) {
    logger.warn('Suspicious content detected in document', {
      service: 'context-sanitizer',
      documentTitle: doc.metadata?.documentTitle || 'unknown',
      injectionPatterns: injectionCheck.patterns.length,
      harmfulIssues: harmfulCheck.issues.length,
      contentPreview: originalContent.substring(0, 100),
    });
  }

  return {
    ...doc,
    pageContent: sanitizeText(originalContent),
    metadata: {
      ...doc.metadata,
      _sanitized: true,
      _hadInjectionPatterns: injectionCheck.hasInjection,
      _hadHarmfulContent: harmfulCheck.hasHarmful,
    },
  };
}

/**
 * Sanitize an array of documents
 * @param {Array} docs - Array of document objects
 * @returns {Array} - Array of sanitized documents
 */
export function sanitizeDocuments(docs) {
  if (!Array.isArray(docs)) {
    return [];
  }

  const sanitized = docs.map(sanitizeDocument);

  // Log summary
  const flaggedCount = sanitized.filter(
    (d) => d.metadata?._hadInjectionPatterns || d.metadata?._hadHarmfulContent
  ).length;

  if (flaggedCount > 0) {
    logger.warn('Context sanitization summary', {
      service: 'context-sanitizer',
      totalDocs: docs.length,
      flaggedDocs: flaggedCount,
    });
  }

  return sanitized;
}

/**
 * Sanitize context string before injection into prompt
 * This is a final safety check on the formatted context
 * @param {string} context - Formatted context string
 * @returns {string} - Sanitized context
 */
export function sanitizeFormattedContext(context) {
  if (!context || typeof context !== 'string') {
    return '';
  }

  // Final sanitization pass
  let sanitized = sanitizeText(context);

  // Add boundary markers to help LLM understand context boundaries
  sanitized = `[BEGIN RETRIEVED CONTEXT]\n${sanitized}\n[END RETRIEVED CONTEXT]`;

  return sanitized;
}

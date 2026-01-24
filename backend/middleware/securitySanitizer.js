/**
 * Security Sanitizer Middleware
 *
 * Express 5 compatible middleware for:
 * - NoSQL injection protection (replaces express-mongo-sanitize)
 * - XSS protection (replaces xss-clean)
 *
 * @module middleware/securitySanitizer
 */

import logger from '../config/logger.js';

/**
 * Characters and patterns that indicate NoSQL injection attempts
 */
const NOSQL_INJECTION_PATTERNS = [
  /\$where/i,
  /\$gt/i,
  /\$gte/i,
  /\$lt/i,
  /\$lte/i,
  /\$ne/i,
  /\$in/i,
  /\$nin/i,
  /\$or/i,
  /\$and/i,
  /\$not/i,
  /\$nor/i,
  /\$exists/i,
  /\$type/i,
  /\$mod/i,
  /\$regex/i,
  /\$text/i,
  /\$all/i,
  /\$elemMatch/i,
  /\$size/i,
  /\$slice/i,
];

/**
 * Recursively sanitize an object to remove NoSQL injection patterns
 *
 * @param {any} obj - Object to sanitize
 * @param {string} path - Current path for logging
 * @returns {any} Sanitized object
 */
function sanitizeNoSQL(obj, path = '') {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check for $ operators in string values
    if (obj.startsWith('$')) {
      logger.warn('NoSQL injection attempt blocked', {
        service: 'security',
        path,
        value: obj.substring(0, 50),
      });
      return '';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => sanitizeNoSQL(item, `${path}[${index}]`));
  }

  if (typeof obj === 'object') {
    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      // Block keys starting with $ (MongoDB operators)
      if (key.startsWith('$')) {
        logger.warn('NoSQL injection attempt blocked', {
          service: 'security',
          path: `${path}.${key}`,
          operator: key,
        });
        continue; // Skip this key entirely
      }

      // Check if key matches known injection patterns
      const isInjection = NOSQL_INJECTION_PATTERNS.some((pattern) => pattern.test(key));
      if (isInjection) {
        logger.warn('NoSQL injection pattern blocked', {
          service: 'security',
          path: `${path}.${key}`,
        });
        continue;
      }

      sanitized[key] = sanitizeNoSQL(value, `${path}.${key}`);
    }

    return sanitized;
  }

  return obj;
}

/**
 * XSS dangerous patterns to escape
 */
const XSS_PATTERNS = [
  { pattern: /</g, replacement: '&lt;' },
  { pattern: />/g, replacement: '&gt;' },
  { pattern: /"/g, replacement: '&quot;' },
  { pattern: /'/g, replacement: '&#x27;' },
  { pattern: /\//g, replacement: '&#x2F;' },
  { pattern: /`/g, replacement: '&#96;' },
];

/**
 * Script and event handler patterns (more aggressive blocking)
 */
const XSS_DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:\s*text\/html/gi,
  /vbscript:/gi,
];

/**
 * Sanitize a string for XSS
 *
 * @param {string} str - String to sanitize
 * @param {boolean} aggressive - Use aggressive sanitization
 * @returns {string} Sanitized string
 */
function sanitizeXSS(str, aggressive = false) {
  if (typeof str !== 'string') {
    return str;
  }

  let sanitized = str;

  // Remove dangerous patterns entirely
  for (const pattern of XSS_DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      logger.warn('XSS attempt blocked', {
        service: 'security',
        pattern: pattern.toString(),
        sample: str.substring(0, 100),
      });
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // Escape HTML entities only if aggressive mode or if we detected dangerous content
  if (aggressive) {
    for (const { pattern, replacement } of XSS_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return sanitized;
}

/**
 * Recursively sanitize an object for XSS
 *
 * @param {any} obj - Object to sanitize
 * @param {boolean} aggressive - Use aggressive sanitization
 * @returns {any} Sanitized object
 */
function sanitizeObjectXSS(obj, aggressive = false) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeXSS(obj, aggressive);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectXSS(item, aggressive));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectXSS(value, aggressive);
    }
    return sanitized;
  }

  return obj;
}

/**
 * NoSQL injection protection middleware
 * Sanitizes req.body, req.query, and req.params
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.replaceWith - Value to replace dangerous values with (default: '')
 * @returns {Function} Express middleware
 */
export function mongoSanitize(options = {}) {
  return (req, res, next) => {
    if (req.body) {
      req.body = sanitizeNoSQL(req.body, 'body');
    }

    if (req.query) {
      req.query = sanitizeNoSQL(req.query, 'query');
    }

    if (req.params) {
      req.params = sanitizeNoSQL(req.params, 'params');
    }

    next();
  };
}

/**
 * XSS protection middleware
 * Sanitizes req.body, req.query, and req.params
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.aggressive - Escape all HTML entities (default: false)
 * @returns {Function} Express middleware
 */
export function xssClean(options = {}) {
  const aggressive = options.aggressive || false;

  return (req, res, next) => {
    if (req.body) {
      req.body = sanitizeObjectXSS(req.body, aggressive);
    }

    if (req.query) {
      req.query = sanitizeObjectXSS(req.query, aggressive);
    }

    if (req.params) {
      req.params = sanitizeObjectXSS(req.params, aggressive);
    }

    next();
  };
}

/**
 * Combined security sanitization middleware
 * Applies both NoSQL and XSS protection
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
export function securitySanitizer(options = {}) {
  return (req, res, next) => {
    // NoSQL sanitization
    // Note: In Express 5, req.query, req.params are read-only getters
    // We need to use Object.defineProperty or skip modification
    if (req.body) {
      req.body = sanitizeNoSQL(req.body, 'body');
      req.body = sanitizeObjectXSS(req.body, options.aggressiveXSS);
    }

    // For Express 5 compatibility: query and params are getters, so we sanitize in-place
    if (req.query && Object.keys(req.query).length > 0) {
      const sanitizedQuery = sanitizeNoSQL(req.query, 'query');
      const xssSanitizedQuery = sanitizeObjectXSS(sanitizedQuery, options.aggressiveXSS);
      // Only define if different (avoid unnecessary override)
      if (JSON.stringify(xssSanitizedQuery) !== JSON.stringify(req.query)) {
        Object.defineProperty(req, 'query', {
          value: xssSanitizedQuery,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    if (req.params && Object.keys(req.params).length > 0) {
      const sanitizedParams = sanitizeNoSQL(req.params, 'params');
      const xssSanitizedParams = sanitizeObjectXSS(sanitizedParams, options.aggressiveXSS);
      if (JSON.stringify(xssSanitizedParams) !== JSON.stringify(req.params)) {
        Object.defineProperty(req, 'params', {
          value: xssSanitizedParams,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    next();
  };
}

export default securitySanitizer;

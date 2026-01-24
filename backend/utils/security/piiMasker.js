/**
 * PII Detection and Masking Utility
 *
 * GUARDRAIL: Detect and mask personally identifiable information (PII)
 * - Email addresses
 * - Phone numbers
 * - Social Security Numbers
 * - Credit card numbers
 * - IP addresses
 * - Names (basic detection)
 */

import logger from '../../config/logger.js';
import { guardrailsConfig } from '../../config/guardrails.js';

// PII patterns from config
const piiConfig = guardrailsConfig.output.piiMasking;

// Additional patterns for detection
const PII_PATTERNS = {
  // Emails
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    mask: '[EMAIL REDACTED]',
    type: 'email',
  },

  // Phone numbers (US formats)
  phoneUS: {
    pattern: /\b(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    mask: '[PHONE REDACTED]',
    type: 'phone',
  },

  // International phone numbers
  phoneIntl: {
    pattern: /\b\+[0-9]{1,3}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}\b/g,
    mask: '[PHONE REDACTED]',
    type: 'phone',
  },

  // Social Security Numbers
  ssn: {
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    mask: '[SSN REDACTED]',
    type: 'ssn',
  },

  // Credit card numbers (basic detection)
  creditCard: {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    mask: '[CARD REDACTED]',
    type: 'credit_card',
  },

  // IP addresses
  ipv4: {
    pattern:
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    mask: '[IP REDACTED]',
    type: 'ip_address',
  },

  // IPv6 addresses
  ipv6: {
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    mask: '[IP REDACTED]',
    type: 'ip_address',
  },

  // Date of birth patterns
  dob: {
    pattern: /\b(?:born|dob|birth(?:day|date)?)[:\s]+[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}\b/gi,
    mask: '[DOB REDACTED]',
    type: 'date_of_birth',
  },

  // Passport numbers (basic patterns)
  passport: {
    pattern: /\bpassport[:\s#]+[A-Z0-9]{6,9}\b/gi,
    mask: '[PASSPORT REDACTED]',
    type: 'passport',
  },

  // Driver's license (basic pattern)
  driversLicense: {
    pattern: /\b(?:driver'?s?\s*license|DL)[:\s#]+[A-Z0-9]{5,15}\b/gi,
    mask: '[LICENSE REDACTED]',
    type: 'drivers_license',
  },

  // Bank account numbers
  bankAccount: {
    pattern: /\b(?:account|acct)[:\s#]+[0-9]{8,17}\b/gi,
    mask: '[ACCOUNT REDACTED]',
    type: 'bank_account',
  },

  // Routing numbers
  routingNumber: {
    pattern: /\b(?:routing|ABA)[:\s#]+[0-9]{9}\b/gi,
    mask: '[ROUTING REDACTED]',
    type: 'routing_number',
  },
};

/**
 * Detect PII in text
 * @param {string} text - Text to analyze
 * @returns {Object} Detection results
 */
export function detectPII(text) {
  if (!text || typeof text !== 'string') {
    return { hasPII: false, detections: [], summary: {} };
  }

  const detections = [];
  const summary = {};

  for (const [name, config] of Object.entries(PII_PATTERNS)) {
    // Reset pattern state for global patterns
    config.pattern.lastIndex = 0;

    const matches = text.match(config.pattern) || [];

    if (matches.length > 0) {
      detections.push({
        type: config.type,
        patternName: name,
        count: matches.length,
        // Don't include actual matches for security
        positions: findPositions(text, config.pattern),
      });

      summary[config.type] = (summary[config.type] || 0) + matches.length;
    }
  }

  const hasPII = detections.length > 0;

  if (hasPII) {
    logger.info('PII detected in text', {
      service: 'pii-masker',
      types: Object.keys(summary),
      counts: summary,
    });
  }

  return {
    hasPII,
    detections,
    summary,
    totalDetections: detections.reduce((sum, d) => sum + d.count, 0),
  };
}

/**
 * Find positions of pattern matches (for highlighting)
 */
function findPositions(text, pattern) {
  const positions = [];
  let match;

  // Reset for global patterns
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    positions.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return positions;
}

/**
 * Mask PII in text
 * @param {string} text - Text to mask
 * @param {Object} options - Masking options
 * @returns {Object} Masked text and detection info
 */
export function maskPII(text, options = {}) {
  if (!piiConfig.enabled) {
    return { text, masked: false, detections: [] };
  }

  if (!text || typeof text !== 'string') {
    return { text: text || '', masked: false, detections: [] };
  }

  const {
    types = null, // null = all types
    partialMask = false, // If true, show partial info (e.g., ***-**-1234)
  } = options;

  let maskedText = text;
  const detections = [];

  for (const [name, config] of Object.entries(PII_PATTERNS)) {
    // Skip if not in requested types
    if (types && !types.includes(config.type)) {
      continue;
    }

    // Reset pattern state
    config.pattern.lastIndex = 0;

    const matches = maskedText.match(config.pattern) || [];

    if (matches.length > 0) {
      detections.push({
        type: config.type,
        count: matches.length,
      });

      if (partialMask) {
        // Partial masking - show last few characters
        maskedText = maskedText.replace(config.pattern, (match) => {
          const visible = Math.min(4, Math.floor(match.length / 4));
          const masked = config.mask.slice(0, -1) + match.slice(-visible) + ']';
          return masked;
        });
      } else {
        // Full masking
        maskedText = maskedText.replace(config.pattern, config.mask);
      }
    }
  }

  return {
    text: maskedText,
    originalLength: text.length,
    masked: detections.length > 0,
    detections,
    totalMasked: detections.reduce((sum, d) => sum + d.count, 0),
  };
}

/**
 * Mask PII in object recursively
 * @param {Object} obj - Object to mask
 * @param {Array} fieldsToCheck - Specific fields to check (null = all string fields)
 * @returns {Object} Masked object
 */
export function maskPIIInObject(obj, fieldsToCheck = null) {
  if (!piiConfig.enabled) {
    return obj;
  }

  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const masked = Array.isArray(obj) ? [] : {};
  const piiFound = [];

  for (const [key, value] of Object.entries(obj)) {
    // Skip if specific fields requested and this isn't one
    if (fieldsToCheck && !fieldsToCheck.includes(key)) {
      masked[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      const result = maskPII(value);
      masked[key] = result.text;
      if (result.masked) {
        piiFound.push({ field: key, types: result.detections.map((d) => d.type) });
      }
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskPIIInObject(value, fieldsToCheck);
    } else {
      masked[key] = value;
    }
  }

  if (piiFound.length > 0) {
    logger.debug('PII masked in object', {
      service: 'pii-masker',
      fields: piiFound,
    });
  }

  return masked;
}

/**
 * Validate if text contains PII (for input validation)
 * @param {string} text - Text to validate
 * @returns {Object} Validation result
 */
export function validateNoPII(text) {
  const detection = detectPII(text);

  if (detection.hasPII) {
    return {
      valid: false,
      message: `Input contains potentially sensitive information (${Object.keys(detection.summary).join(', ')})`,
      detectedTypes: Object.keys(detection.summary),
    };
  }

  return { valid: true };
}

/**
 * Middleware to detect PII in request body
 */
export function piiDetectionMiddleware(fieldsToCheck = ['question', 'content', 'message']) {
  return (req, res, next) => {
    if (!piiConfig.enabled) {
      return next();
    }

    let piiDetected = false;
    const detectedIn = [];

    for (const field of fieldsToCheck) {
      if (req.body?.[field]) {
        const result = detectPII(req.body[field]);
        if (result.hasPII) {
          piiDetected = true;
          detectedIn.push({
            field,
            types: Object.keys(result.summary),
          });
        }
      }
    }

    // Attach detection info to request
    req.piiDetected = piiDetected;
    req.piiInfo = detectedIn;

    if (piiDetected) {
      logger.warn('PII detected in request', {
        service: 'pii-masker',
        endpoint: req.originalUrl,
        detectedIn,
        userId: req.user?.userId,
      });

      // Import here to avoid circular dependency
      import('../services/securityLogger.js').then(({ logSecurityEvent }) => {
        logSecurityEvent(
          'pii_detected',
          {
            endpoint: req.originalUrl,
            detectedIn,
          },
          {
            userId: req.user?.userId,
            ipAddress: req.ip,
          }
        );
      });
    }

    next();
  };
}

/**
 * Mask PII in response data
 */
export function maskPIIInResponse(data, options = {}) {
  if (!piiConfig.enabled) {
    return data;
  }

  const fieldsToMask = options.fields || ['answer', 'content', 'message', 'text'];

  if (typeof data === 'string') {
    return maskPII(data).text;
  }

  if (typeof data === 'object' && data !== null) {
    return maskPIIInObject(data, fieldsToMask);
  }

  return data;
}

/**
 * Get PII masking configuration
 */
export function getPIIMaskingConfig() {
  return {
    enabled: piiConfig.enabled,
    supportedTypes: Object.keys(PII_PATTERNS).map((name) => ({
      name,
      type: PII_PATTERNS[name].type,
    })),
  };
}

/**
 * SECURITY FIX (LLM06): Additional patterns for output scanning
 * Detects sensitive information that might leak from LLM responses
 */
const OUTPUT_SENSITIVE_PATTERNS = {
  // API keys and tokens
  apiKey: {
    pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    mask: '[API_KEY REDACTED]',
    type: 'api_key',
    severity: 'critical',
  },
  secretKey: {
    pattern:
      /\b(?:secret[_-]?key|secretkey|client[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    mask: '[SECRET REDACTED]',
    type: 'secret',
    severity: 'critical',
  },
  bearerToken: {
    pattern: /\bBearer\s+([a-zA-Z0-9_-]{20,})/gi,
    mask: 'Bearer [TOKEN REDACTED]',
    type: 'bearer_token',
    severity: 'critical',
  },
  jwtToken: {
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    mask: '[JWT REDACTED]',
    type: 'jwt',
    severity: 'critical',
  },

  // Private keys
  privateKey: {
    pattern:
      /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
    mask: '[PRIVATE_KEY REDACTED]',
    type: 'private_key',
    severity: 'critical',
  },

  // Database connection strings
  dbConnectionString: {
    pattern: /\b(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi,
    mask: '[DB_CONNECTION REDACTED]',
    type: 'connection_string',
    severity: 'high',
  },

  // AWS credentials
  awsAccessKey: {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    mask: '[AWS_KEY REDACTED]',
    type: 'aws_key',
    severity: 'critical',
  },
  awsSecretKey: {
    pattern:
      /\b(?:aws[_-]?secret|secret[_-]?access[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,
    mask: '[AWS_SECRET REDACTED]',
    type: 'aws_secret',
    severity: 'critical',
  },

  // Internal paths and configs
  internalPath: {
    pattern:
      /\b(?:\/(?:etc|var|home|root|usr)\/[^\s'"]+|[A-Z]:\\(?:Users|Windows|Program)[^\s'"]+)/g,
    mask: '[PATH REDACTED]',
    type: 'internal_path',
    severity: 'medium',
  },

  // Environment variables with values
  envVariable: {
    pattern: /\b(?:process\.env\.|ENV\[)['"A-Z_]+['"]\]?\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
    mask: '[ENV_VAR REDACTED]',
    type: 'env_variable',
    severity: 'high',
  },
};

/**
 * SECURITY FIX (LLM06): Patterns that indicate system prompt leakage
 */
const PROMPT_LEAK_PATTERNS = [
  {
    pattern: /my\s+(?:system\s+)?instructions?\s+(?:are|say|tell|state)/gi,
    type: 'instruction_leak',
  },
  {
    pattern: /(?:i\s+was|i\s+am)\s+(?:programmed|instructed|told)\s+to/gi,
    type: 'instruction_leak',
  },
  { pattern: /my\s+(?:original|initial|base)\s+(?:prompt|instructions?)/gi, type: 'prompt_leak' },
  {
    pattern: /the\s+system\s+(?:prompt|message|instructions?)\s+(?:is|says|tells)/gi,
    type: 'system_leak',
  },
  { pattern: /\[system\]|\[assistant\]|\[user\]/gi, type: 'role_marker_leak' },
  { pattern: /CRITICAL\s+INSTRUCTIONS?:/gi, type: 'system_leak' },
  { pattern: /you\s+are\s+an?\s+(?:helpful|expert|AI)\s+assistant/gi, type: 'system_leak' },
];

/**
 * SECURITY FIX (LLM06): Scan LLM output for sensitive information
 * This includes PII, credentials, and potential system prompt leaks
 *
 * @param {string} output - LLM output text to scan
 * @param {Object} options - Scanning options
 * @returns {Object} Scan results with detected issues and sanitized text
 */
export function scanOutputForSensitiveInfo(output, options = {}) {
  if (!output || typeof output !== 'string') {
    return {
      clean: true,
      text: output || '',
      detections: [],
      promptLeakDetected: false,
    };
  }

  const {
    maskSensitive = true,
    logDetections = true,
    strictMode = false, // If true, any detection blocks the response
  } = options;

  let processedText = output;
  const detections = [];
  let promptLeakDetected = false;
  let hasCriticalLeak = false;

  // Step 1: Check for standard PII
  const piiResult = detectPII(output);
  if (piiResult.hasPII) {
    detections.push({
      category: 'pii',
      types: Object.keys(piiResult.summary),
      count: piiResult.totalDetections,
    });

    if (maskSensitive) {
      processedText = maskPII(processedText).text;
    }
  }

  // Step 2: Check for output-specific sensitive patterns
  for (const [name, config] of Object.entries(OUTPUT_SENSITIVE_PATTERNS)) {
    config.pattern.lastIndex = 0;
    const matches = processedText.match(config.pattern) || [];

    if (matches.length > 0) {
      detections.push({
        category: 'sensitive',
        patternName: name,
        type: config.type,
        severity: config.severity,
        count: matches.length,
      });

      if (config.severity === 'critical') {
        hasCriticalLeak = true;
      }

      if (maskSensitive) {
        config.pattern.lastIndex = 0;
        processedText = processedText.replace(config.pattern, config.mask);
      }
    }
  }

  // Step 3: Check for prompt leakage indicators
  for (const { pattern, type } of PROMPT_LEAK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(output)) {
      promptLeakDetected = true;
      detections.push({
        category: 'prompt_leak',
        type,
        severity: 'high',
      });
    }
  }

  // Log detections if enabled
  if (logDetections && detections.length > 0) {
    logger.warn('Sensitive information detected in LLM output', {
      service: 'pii-masker',
      detectionCount: detections.length,
      categories: [...new Set(detections.map((d) => d.category))],
      hasCriticalLeak,
      promptLeakDetected,
      outputPreview: output.substring(0, 100),
    });
  }

  const isClean = detections.length === 0;
  const shouldBlock = strictMode && (hasCriticalLeak || promptLeakDetected);

  return {
    clean: isClean,
    text: shouldBlock ? '[Response blocked due to sensitive content]' : processedText,
    originalText: output,
    detections,
    promptLeakDetected,
    hasCriticalLeak,
    blocked: shouldBlock,
    summary: {
      piiCount: piiResult.totalDetections || 0,
      sensitiveCount: detections
        .filter((d) => d.category === 'sensitive')
        .reduce((sum, d) => sum + (d.count || 1), 0),
      promptLeakCount: detections.filter((d) => d.category === 'prompt_leak').length,
    },
  };
}

/**
 * SECURITY FIX (LLM06): Middleware to scan and sanitize response data
 */
export function outputScanMiddleware(options = {}) {
  return (_req, res, next) => {
    if (!piiConfig.enabled) {
      return next();
    }

    // Wrap res.json to scan output
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (data && typeof data === 'object') {
        // Scan specific fields in response
        const fieldsToScan = ['answer', 'formattedAnswer', 'content', 'message', 'text'];

        for (const field of fieldsToScan) {
          if (data.data && typeof data.data[field] === 'string') {
            const scanResult = scanOutputForSensitiveInfo(data.data[field], options);
            if (!scanResult.clean) {
              data.data[field] = scanResult.text;
              data.data._sensitiveContentFiltered = true;
            }
          }
        }
      }

      return originalJson(data);
    };

    next();
  };
}

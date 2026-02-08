import logger from '../../config/logger.js';

/**
 * PII Detection Service
 * Scans content for sensitive data patterns and determines appropriate trust level
 *
 * Trust Level Hierarchy:
 * - REGULATED: Medical, financial, government IDs (highest protection)
 * - INTERNAL: Company confidential, personal but non-regulated
 * - PUBLIC: No sensitive data detected
 */

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

/**
 * Patterns that indicate REGULATED data (HIPAA, PCI-DSS, GDPR sensitive)
 */
const REGULATED_PATTERNS = [
  // Government IDs
  { name: 'SSN', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, weight: 10 },
  { name: 'SSN_TEXT', pattern: /\b(?:social\s*security\s*(?:number|#|no\.?))\s*:?\s*\d/i, weight: 10 },
  { name: 'PASSPORT', pattern: /\b(?:passport\s*(?:number|#|no\.?))\s*:?\s*[A-Z0-9]{6,12}\b/i, weight: 8 },
  { name: 'DRIVERS_LICENSE', pattern: /\b(?:driver'?s?\s*license\s*(?:number|#|no\.?))\s*:?\s*[A-Z0-9]{5,15}\b/i, weight: 8 },

  // Financial - PCI-DSS
  { name: 'CREDIT_CARD', pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, weight: 10 },
  { name: 'BANK_ACCOUNT', pattern: /\b(?:bank\s*account\s*(?:number|#|no\.?))\s*:?\s*\d{8,17}\b/i, weight: 9 },
  { name: 'ROUTING_NUMBER', pattern: /\b(?:routing\s*(?:number|#|no\.?))\s*:?\s*\d{9}\b/i, weight: 9 },
  { name: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b/, weight: 8 },

  // Medical - HIPAA
  { name: 'MEDICAL_RECORD', pattern: /\b(?:medical\s*record\s*(?:number|#|no\.?)|MRN)\s*:?\s*[A-Z0-9]{5,15}\b/i, weight: 10 },
  { name: 'DIAGNOSIS', pattern: /\b(?:diagnosis|diagnosed\s*with|ICD[-\s]?10)\s*:?\s*[A-Z0-9.]{3,10}\b/i, weight: 9 },
  { name: 'PRESCRIPTION', pattern: /\b(?:prescription|Rx|prescribed)\s*:?\s*(?:for|of)?\s*[A-Za-z]{3,}/i, weight: 7 },
  { name: 'PATIENT_INFO', pattern: /\b(?:patient\s*(?:name|ID|information)|PHI|protected\s*health)\b/i, weight: 8 },
  { name: 'HIPAA_MENTION', pattern: /\bHIPAA\b/, weight: 6 },

  // Tax Information
  { name: 'TAX_ID', pattern: /\b(?:tax\s*ID|EIN|TIN)\s*:?\s*\d{2}[-\s]?\d{7}\b/i, weight: 9 },
  { name: 'W2_W9', pattern: /\b(?:W[-\s]?[249]|1099)\s*form\b/i, weight: 8 },
];

/**
 * Patterns that indicate INTERNAL data (company confidential)
 */
const INTERNAL_PATTERNS = [
  // Confidentiality markers
  { name: 'CONFIDENTIAL', pattern: /\b(?:confidential|strictly\s*confidential|company\s*confidential)\b/i, weight: 5 },
  { name: 'INTERNAL_ONLY', pattern: /\b(?:internal\s*only|internal\s*use|not\s*for\s*distribution)\b/i, weight: 5 },
  { name: 'DO_NOT_SHARE', pattern: /\b(?:do\s*not\s*share|don'?t\s*share|private)\b/i, weight: 4 },
  { name: 'NDA', pattern: /\b(?:NDA|non[-\s]?disclosure|confidentiality\s*agreement)\b/i, weight: 5 },

  // HR/Employment
  { name: 'SALARY', pattern: /\b(?:salary|compensation|annual\s*pay|hourly\s*rate)\s*:?\s*\$?\d/i, weight: 6 },
  { name: 'PERFORMANCE_REVIEW', pattern: /\b(?:performance\s*review|employee\s*evaluation|annual\s*review)\b/i, weight: 4 },
  { name: 'EMPLOYEE_ID', pattern: /\b(?:employee\s*(?:ID|number|#))\s*:?\s*[A-Z0-9]{4,10}\b/i, weight: 4 },

  // Business sensitive
  { name: 'TRADE_SECRET', pattern: /\b(?:trade\s*secret|proprietary|intellectual\s*property)\b/i, weight: 6 },
  { name: 'FINANCIAL_FORECAST', pattern: /\b(?:revenue\s*forecast|financial\s*projection|budget\s*plan)\b/i, weight: 5 },
  { name: 'ACQUISITION', pattern: /\b(?:acquisition\s*target|merger|M&A)\b/i, weight: 5 },

  // Personal contact info (less sensitive but still internal)
  { name: 'PHONE', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, weight: 2 },
  { name: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, weight: 1 },
];

// =============================================================================
// DETECTION ENGINE
// =============================================================================

/**
 * Detection result
 * @typedef {Object} DetectionResult
 * @property {string} trustLevel - Detected trust level
 * @property {number} confidenceScore - 0-100 confidence score
 * @property {Array} detectedPatterns - List of detected patterns
 * @property {boolean} shouldUpgrade - Whether trust level should be upgraded
 * @property {string} reason - Human-readable reason
 */

/**
 * Scan content for PII and determine appropriate trust level
 * @param {string} content - Text content to scan
 * @param {string} currentTrustLevel - Current workspace trust level
 * @returns {DetectionResult} Detection result
 */
export function detectPII(content, currentTrustLevel = 'internal') {
  if (!content || typeof content !== 'string') {
    return {
      trustLevel: currentTrustLevel,
      confidenceScore: 0,
      detectedPatterns: [],
      shouldUpgrade: false,
      reason: 'No content to analyze',
    };
  }

  const detectedPatterns = [];
  let regulatedScore = 0;
  let internalScore = 0;

  // Check regulated patterns
  for (const { name, pattern, weight } of REGULATED_PATTERNS) {
    const matches = content.match(new RegExp(pattern, 'gi'));
    if (matches) {
      regulatedScore += weight * Math.min(matches.length, 5); // Cap at 5 matches
      detectedPatterns.push({
        type: 'regulated',
        name,
        matchCount: matches.length,
        weight,
      });
    }
  }

  // Check internal patterns
  for (const { name, pattern, weight } of INTERNAL_PATTERNS) {
    const matches = content.match(new RegExp(pattern, 'gi'));
    if (matches) {
      internalScore += weight * Math.min(matches.length, 5);
      detectedPatterns.push({
        type: 'internal',
        name,
        matchCount: matches.length,
        weight,
      });
    }
  }

  // Determine trust level based on scores
  let detectedTrustLevel = 'public';
  let confidenceScore = 0;

  if (regulatedScore >= 10) {
    detectedTrustLevel = 'regulated';
    confidenceScore = Math.min(100, regulatedScore * 5);
  } else if (regulatedScore > 0 || internalScore >= 8) {
    detectedTrustLevel = 'internal';
    confidenceScore = Math.min(100, (regulatedScore * 5) + (internalScore * 3));
  } else if (internalScore > 0) {
    detectedTrustLevel = 'internal';
    confidenceScore = Math.min(80, internalScore * 5);
  } else {
    confidenceScore = 100; // Confident it's public
  }

  // Determine if upgrade is needed (never downgrade)
  const trustLevelPriority = { public: 0, internal: 1, regulated: 2 };
  const currentPriority = trustLevelPriority[currentTrustLevel] || 1;
  const detectedPriority = trustLevelPriority[detectedTrustLevel] || 1;
  const shouldUpgrade = detectedPriority > currentPriority;

  // Generate reason
  let reason = '';
  if (shouldUpgrade) {
    const topPatterns = detectedPatterns
      .filter(p => p.type === detectedTrustLevel || (detectedTrustLevel === 'internal' && p.type === 'regulated'))
      .slice(0, 3)
      .map(p => p.name)
      .join(', ');
    reason = `Detected sensitive data patterns: ${topPatterns}`;
  } else if (detectedPatterns.length > 0) {
    reason = `Content matches current trust level (${currentTrustLevel})`;
  } else {
    reason = 'No sensitive patterns detected';
  }

  return {
    trustLevel: shouldUpgrade ? detectedTrustLevel : currentTrustLevel,
    confidenceScore,
    detectedPatterns,
    shouldUpgrade,
    reason,
  };
}

/**
 * Scan multiple chunks and aggregate results
 * @param {Array<string>} chunks - Array of text chunks
 * @param {string} currentTrustLevel - Current workspace trust level
 * @returns {DetectionResult} Aggregated detection result
 */
export function scanChunks(chunks, currentTrustLevel = 'internal') {
  if (!chunks || chunks.length === 0) {
    return {
      trustLevel: currentTrustLevel,
      confidenceScore: 0,
      detectedPatterns: [],
      shouldUpgrade: false,
      reason: 'No chunks to analyze',
    };
  }

  const allPatterns = [];
  let maxTrustLevel = 'public';
  let totalConfidence = 0;
  const trustLevelPriority = { public: 0, internal: 1, regulated: 2 };

  // Scan each chunk
  for (const chunk of chunks) {
    const result = detectPII(chunk, currentTrustLevel);
    allPatterns.push(...result.detectedPatterns);
    totalConfidence += result.confidenceScore;

    if (trustLevelPriority[result.trustLevel] > trustLevelPriority[maxTrustLevel]) {
      maxTrustLevel = result.trustLevel;
    }
  }

  // Deduplicate patterns
  const uniquePatterns = [];
  const seenPatterns = new Set();
  for (const pattern of allPatterns) {
    const key = `${pattern.type}:${pattern.name}`;
    if (!seenPatterns.has(key)) {
      seenPatterns.add(key);
      uniquePatterns.push(pattern);
    }
  }

  const avgConfidence = Math.round(totalConfidence / chunks.length);
  const shouldUpgrade = trustLevelPriority[maxTrustLevel] > trustLevelPriority[currentTrustLevel];

  let reason = '';
  if (shouldUpgrade) {
    const topPatterns = uniquePatterns
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map(p => p.name)
      .join(', ');
    reason = `Detected sensitive data in ${chunks.length} chunks: ${topPatterns}`;
  } else {
    reason = `Scanned ${chunks.length} chunks - content matches trust level (${currentTrustLevel})`;
  }

  return {
    trustLevel: shouldUpgrade ? maxTrustLevel : currentTrustLevel,
    confidenceScore: avgConfidence,
    detectedPatterns: uniquePatterns,
    shouldUpgrade,
    reason,
    chunksScanned: chunks.length,
  };
}

/**
 * Quick check if content likely contains regulated data
 * Faster than full detection for pre-screening
 * @param {string} content - Content to check
 * @returns {boolean} True if regulated patterns detected
 */
export function hasRegulatedData(content) {
  if (!content) return false;

  // Quick check with high-confidence patterns only
  const quickPatterns = [
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, // SSN
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b/, // Credit card
    /\b(?:medical\s*record|MRN|diagnosis|patient\s*ID)\b/i, // Medical
    /\bHIPAA\b/,
  ];

  return quickPatterns.some(pattern => pattern.test(content));
}

/**
 * Log detection event for audit purposes
 */
export function logDetection(workspaceId, sourceId, result) {
  if (result.shouldUpgrade || result.detectedPatterns.length > 0) {
    logger.info('PII detection completed', {
      service: 'pii-detector',
      workspaceId,
      sourceId,
      trustLevel: result.trustLevel,
      shouldUpgrade: result.shouldUpgrade,
      patternsDetected: result.detectedPatterns.length,
      confidence: result.confidenceScore,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  detectPII,
  scanChunks,
  hasRegulatedData,
  logDetection,
  REGULATED_PATTERNS,
  INTERNAL_PATTERNS,
};

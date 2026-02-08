/**
 * Security Utilities Index
 *
 * Centralized exports for all security-related utilities:
 * - PII detection and masking
 * - Prompt injection detection
 * - Output sanitization
 * - Context sanitization
 * - Confidence handling
 * - Encryption utilities
 * - JWT utilities
 * - Cookie security
 */

// PII Detection & Masking
export {
  detectPII,
  maskPII,
  maskPIIInObject,
  validateNoPII,
  piiDetectionMiddleware,
  maskPIIInResponse,
  getPIIMaskingConfig,
  scanOutputForSensitiveInfo,
  outputScanMiddleware,
} from './piiMasker.js';

// Prompt Injection Detection
export { normalizeText, analyzeForInjection, validateInput } from './promptInjectionDetector.js';

// Output Sanitization
export {
  encodeHTMLEntities,
  decodeHTMLEntities,
  removeDangerousPatterns,
  detectSuspiciousOutput,
  sanitizeLLMOutput,
  sanitizeForJSON,
  sanitizeForSQL,
  sanitizeRAGResponse,
} from './outputSanitizer.js';

// Context Sanitization
export {
  detectInjectionPatterns,
  detectHarmfulContent,
  sanitizeText,
  sanitizeDocument,
  sanitizeDocuments,
  sanitizeFormattedContext,
} from './contextSanitizer.js';

// Confidence Handling
export {
  ConfidenceLevel,
  getConfidenceLevel,
  getConfidenceMessage,
  processConfidence,
  shouldBlockResponse,
  getConfidenceConfig,
  getConfidenceBand,
  applyConfidenceHandling,
} from './confidenceHandler.js';

// Encryption (with key rotation support)
export {
  encrypt,
  decrypt,
  rotateEncryption,
  needsKeyRotation,
  getEncryptionVersion,
  getCurrentKeyVersion,
  getKeyRotationStatus,
  generateEncryptionKey,
} from './encryption.js';

// Field-level Encryption
export {
  encryptField,
  decryptField,
  encryptFields,
  decryptFields,
  hashField,
  verifyHashedField,
} from './fieldEncryption.js';

// JWT Utilities
export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from './jwt.js';

// Cookie Configuration
export {
  getCookieOptions,
  getRefreshTokenCookieOptions,
  clearCookieOptions,
} from './cookieConfig.js';

// Crypto Utilities
export {
  sha256,
  generateToken,
  generateTokenPair,
  verifyToken,
  timingSafeEqual,
  contentHash,
} from './crypto.js';

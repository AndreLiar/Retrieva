/**
 * Central export file for all utility functions
 *
 * Utilities are organized into subfolders:
 * - core/     - Core helper utilities (async, errors, formatting)
 * - security/ - Security utilities (PII, encryption, sanitization)
 * - rag/      - RAG-specific utilities (context, cache)
 *
 * @example
 * import { catchAsync, AppError, sendSuccess } from './utils/index.js';
 * import { sanitizeLLMOutput } from './utils/security/index.js';
 * import { ragCache } from './utils/rag/index.js';
 */

// ============================================
// CORE UTILITIES
// ============================================

// Error handling
export { catchAsync, AppError, globalErrorHandler } from './core/errorHandler.js';

// Validators
export {
  isValidEmail,
  isNotEmpty,
  validateQuestion,
  validateChatHistory,
  sanitizeInput,
} from './core/validators.js';

// Response formatters
export { sendSuccess, sendError, sendPaginatedResponse } from './core/responseFormatter.js';

// String helpers
export { truncate, capitalize, slugify } from './core/stringHelpers.js';

// Date helpers
export {
  getCurrentTimestamp,
  formatDate,
  formatDateTime,
  getTimeAgo,
  calculateDuration,
  isValidDate,
} from './core/dateHelpers.js';

// Async helpers
export {
  sleep,
  retryWithBackoff,
  batchProcess,
  promiseWithTimeout,
  debounce,
  rateLimit,
} from './core/asyncHelpers.js';

// Request helpers
export {
  getUserId,
  isAuthenticated,
  parsePagination,
  parsePagePagination,
  buildPaginationMeta,
  parseSort,
  verifyOwnership,
} from './core/requestHelpers.js';

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

// Security utilities (most commonly used)
export { sanitizeLLMOutput } from './security/outputSanitizer.js';
export { sanitizeDocuments, sanitizeFormattedContext } from './security/contextSanitizer.js';
export { scanOutputForSensitiveInfo, maskPII } from './security/piiMasker.js';
export { applyConfidenceHandling } from './security/confidenceHandler.js';

// RAG utilities (most commonly used)
export { formatContext, formatSources } from './rag/contextFormatter.js';
export { ragCache } from './rag/ragCache.js';

// Crypto utilities (most commonly used)
export {
  sha256,
  generateToken,
  generateTokenPair,
  verifyToken,
  contentHash,
} from './security/crypto.js';

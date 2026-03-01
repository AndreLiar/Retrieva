/**
 * Core Utilities Index
 *
 * Centralized exports for core utility functions:
 * - Async helpers
 * - Circuit breaker
 * - Error handling
 * - Response formatting
 * - Validators
 * - String/Date helpers
 * - Rate limiting
 */

// Async Helpers
export {
  sleep,
  retryWithBackoff,
  batchProcess,
  promiseWithTimeout,
  debounce,
  rateLimit,
  LLMTimeoutError,
  invokeWithTimeout,
  streamWithTimeout,
} from './asyncHelpers.js';

// Legacy exports for backwards compatibility
export { catchAsync } from './errorHandler.js';

// Circuit Breaker
export { CircuitBreaker, createCircuitBreaker } from './circuitBreaker.js';

// Error Handler
export { AppError, handleError } from './errorHandler.js';

// Response Formatter
export { sendSuccess, sendError, formatPagination } from './responseFormatter.js';

// Validators
export { validateObjectId, validateEmail, validatePagination } from './validators.js';

// String Helpers
export { truncate, slugify, capitalize } from './stringHelpers.js';

// Date Helpers
export { formatDate, parseDate, getRelativeTime } from './dateHelpers.js';

// Request Helpers
export {
  getUserId,
  isAuthenticated,
  parsePagination,
  parsePagePagination,
  buildPaginationMeta,
  parseSort,
  verifyOwnership,
} from './requestHelpers.js';

import logger from '../../config/logger.js';

/**
 * FIX 3: Document Retry Tracker
 * Tracks failed document processing attempts and determines when to skip
 */
class DocumentRetryTracker {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
    this.failures = new Map(); // documentId -> { count, lastError, timestamp }
  }

  /**
   * Record a failure for a document
   * @param {string} documentId - Document ID
   * @param {Error} error - Error that occurred
   * @returns {boolean} True if document should be skipped
   */
  recordFailure(documentId, error) {
    const existing = this.failures.get(documentId) || { count: 0, errors: [] };

    existing.count++;
    existing.lastError = error.message;
    existing.timestamp = new Date();
    existing.errors.push({
      message: error.message,
      timestamp: new Date(),
    });

    this.failures.set(documentId, existing);

    const shouldSkip = existing.count >= this.maxRetries;

    if (shouldSkip) {
      logger.warn(`Document ${documentId} failed ${existing.count} times - will skip`, {
        service: 'retry-tracker',
        documentId,
        failureCount: existing.count,
        lastError: error.message,
      });
    }

    return shouldSkip;
  }

  /**
   * Check if document should be skipped
   * @param {string} documentId - Document ID
   * @returns {boolean}
   */
  shouldSkip(documentId) {
    const failures = this.failures.get(documentId);
    return failures && failures.count >= this.maxRetries;
  }

  /**
   * Get failure info for a document
   * @param {string} documentId - Document ID
   * @returns {Object|null}
   */
  getFailureInfo(documentId) {
    return this.failures.get(documentId) || null;
  }

  /**
   * Reset failures for a document (after successful processing)
   * @param {string} documentId - Document ID
   */
  resetFailures(documentId) {
    this.failures.delete(documentId);
  }

  /**
   * Get all skipped documents
   * @returns {Array}
   */
  getSkippedDocuments() {
    const skipped = [];
    for (const [documentId, failures] of this.failures.entries()) {
      if (failures.count >= this.maxRetries) {
        skipped.push({
          documentId,
          failureCount: failures.count,
          lastError: failures.lastError,
          timestamp: failures.timestamp,
          errors: failures.errors,
        });
      }
    }
    return skipped;
  }

  /**
   * Clear old failures (cleanup - optional, call periodically)
   * @param {number} maxAgeMs - Max age in milliseconds (default: 24 hours)
   */
  clearOldFailures(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleared = 0;

    for (const [documentId, failures] of this.failures.entries()) {
      if (now - failures.timestamp.getTime() > maxAgeMs) {
        this.failures.delete(documentId);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info(`Cleared ${cleared} old failure records`, { service: 'retry-tracker' });
    }
  }

  /**
   * Determine if error is retryable or should skip immediately
   * @param {Error} error - Error to analyze
   * @returns {boolean} True if error is retryable
   */
  isRetryableError(error) {
    const errorMessage = error.message.toLowerCase();

    // Non-retryable errors (skip immediately)
    const nonRetryablePatterns = [
      'invalid',
      'unauthorized',
      'forbidden',
      'not found',
      'validation failed',
    ];

    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    // Retryable errors
    const retryablePatterns = [
      'timeout',
      'rate_limited',
      'connection',
      'econnreset',
      'enotfound',
      'network',
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    // Default: retry unknown errors
    return true;
  }
}

// Singleton instance
export const documentRetryTracker = new DocumentRetryTracker(3);

export default DocumentRetryTracker;

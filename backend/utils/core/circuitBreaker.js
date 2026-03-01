import logger from '../../config/logger.js';

/**
 * FIX 4: Circuit Breaker Pattern
 * Prevents cascading failures by temporarily stopping requests when error rate is high
 *
 * States:
 * - CLOSED: Normal operation, requests go through
 * - OPEN: Too many failures, requests are blocked
 * - HALF_OPEN: Testing if service recovered
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5; // Open after N failures
    this.successThreshold = options.successThreshold || 2; // Close after N successes in half-open
    this.timeout = options.timeout || 60000; // Time to wait before half-open (60s)
    this.windowSize = options.windowSize || 10; // Rolling window size for error rate

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.recentResults = []; // Rolling window of recent results (true = success, false = failure)
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @param {string} context - Context for logging (e.g., "Notion API")
   * @returns {Promise<*>}
   */
  async execute(fn, context = 'API') {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      // Check if enough time has passed to try half-open
      if (Date.now() < this.nextAttempt) {
        const waitTime = Math.ceil((this.nextAttempt - Date.now()) / 1000);
        const error = new Error(`Circuit breaker is OPEN for ${context}. Retry in ${waitTime}s`);
        error.circuitBreakerOpen = true;
        throw error;
      }

      // Transition to half-open to test
      this.state = 'HALF_OPEN';
      this.successes = 0;
      logger.info(`Circuit breaker entering HALF_OPEN state for ${context}`, {
        service: 'circuit-breaker',
        context,
      });
    }

    try {
      // Execute the function
      const result = await fn();

      // Record success
      this.onSuccess(context);

      return result;
    } catch (error) {
      // Record failure
      this.onFailure(context, error);

      throw error;
    }
  }

  /**
   * Record a successful execution
   * @param {string} context - Context for logging
   */
  onSuccess(context) {
    this.failures = 0;
    this.recentResults.push(true);

    // Maintain rolling window
    if (this.recentResults.length > this.windowSize) {
      this.recentResults.shift();
    }

    if (this.state === 'HALF_OPEN') {
      this.successes++;

      if (this.successes >= this.successThreshold) {
        // Close circuit - service recovered
        this.state = 'CLOSED';
        this.successes = 0;
        logger.info(`Circuit breaker CLOSED for ${context} - service recovered`, {
          service: 'circuit-breaker',
          context,
        });
      }
    }
  }

  /**
   * Record a failed execution
   * @param {string} context - Context for logging
   * @param {Error} error - Error that occurred
   */
  onFailure(context, error) {
    this.failures++;
    this.recentResults.push(false);

    // Maintain rolling window
    if (this.recentResults.length > this.windowSize) {
      this.recentResults.shift();
    }

    // Calculate error rate in recent window
    const errorRate = this.getErrorRate();

    logger.warn(`Circuit breaker failure recorded for ${context}`, {
      service: 'circuit-breaker',
      context,
      consecutiveFailures: this.failures,
      errorRate: `${(errorRate * 100).toFixed(1)}%`,
      state: this.state,
      error: error.message,
    });

    if (this.state === 'HALF_OPEN') {
      // Failed during testing, reopen circuit
      this.openCircuit(context);
    } else if (this.failures >= this.failureThreshold) {
      // Too many failures, open circuit
      this.openCircuit(context);
    }
  }

  /**
   * Open the circuit
   * @param {string} context - Context for logging
   */
  openCircuit(context) {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.timeout;

    const waitTime = Math.ceil(this.timeout / 1000);

    logger.error(`Circuit breaker OPEN for ${context} - blocking requests for ${waitTime}s`, {
      service: 'circuit-breaker',
      context,
      consecutiveFailures: this.failures,
      errorRate: `${(this.getErrorRate() * 100).toFixed(1)}%`,
      retryAfter: new Date(this.nextAttempt).toISOString(),
    });
  }

  /**
   * Get current error rate from rolling window
   * @returns {number} Error rate (0-1)
   */
  getErrorRate() {
    if (this.recentResults.length === 0) return 0;

    const failures = this.recentResults.filter((r) => !r).length;
    return failures / this.recentResults.length;
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      errorRate: this.getErrorRate(),
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt).toISOString() : null,
    };
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.recentResults = [];
    this.nextAttempt = Date.now();

    logger.info('Circuit breaker manually reset', { service: 'circuit-breaker' });
  }

  /**
   * Check if circuit is open
   * @returns {boolean}
   */
  isOpen() {
    return this.state === 'OPEN' && Date.now() < this.nextAttempt;
  }
}

export default CircuitBreaker;

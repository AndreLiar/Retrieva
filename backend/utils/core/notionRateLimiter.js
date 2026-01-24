import 'dotenv/config';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket rate limiter for Notion API
 * CRITICAL: Notion enforces strict rate limits and penalizes parallel requests heavily
 * Safe limits: 2-3 req/sec with minimum 350ms delay between requests
 *
 * Notion API behavior:
 * - Parallel requests trigger immediate 429 throttling
 * - Rate limits are per-integration and per-workspace
 * - No burst tolerance
 */
export class NotionRateLimiter {
  constructor(requestsPerSecond = null) {
    // Default to 2.5 req/sec for safety (400ms between requests)
    // Override via env only if you've tested and confirmed it works
    // FIXED: Apply Math.min AFTER parsing env to enforce safety cap
    const envLimit = parseInt(process.env.NOTION_API_RATE_LIMIT) || 3;
    const safeLimit = Math.min(envLimit, 3); // Never exceed 3 req/sec
    this.tokensPerInterval = requestsPerSecond || safeLimit;
    this.interval = 1000; // 1 second in milliseconds
    this.tokens = this.tokensPerInterval;
    this.lastRefill = Date.now();
    this.lastRequestTime = 0;
    // CRITICAL: Increase minimum delay to 400ms for extra safety
    this.minDelayBetweenRequests = 400; // Minimum 400ms between requests (enforced)
  }

  /**
   * Wait for an available token before making an API request
   * Automatically refills tokens based on elapsed time
   * ENFORCES minimum delay between requests regardless of token availability
   */
  async waitForToken() {
    const now = Date.now();

    // CRITICAL: Enforce minimum delay between requests to prevent burst triggering 429
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayBetweenRequests) {
      const additionalDelay = this.minDelayBetweenRequests - timeSinceLastRequest;
      await sleep(additionalDelay);
    }

    const elapsed = now - this.lastRefill;

    // Refill tokens based on elapsed time
    if (elapsed >= this.interval) {
      const intervalsElapsed = Math.floor(elapsed / this.interval);
      const tokensToAdd = intervalsElapsed * this.tokensPerInterval;
      this.tokens = Math.min(this.tokens + tokensToAdd, this.tokensPerInterval);
      this.lastRefill = now - (elapsed % this.interval);
    }

    // If no tokens available, wait until next refill
    if (this.tokens < 1) {
      const timeUntilRefill = this.interval - (now - this.lastRefill);
      await sleep(timeUntilRefill);
      return this.waitForToken(); // Recursive call after wait
    }

    // Consume one token and record request time
    this.tokens -= 1;
    this.lastRequestTime = Date.now();
  }

  /**
   * Reset the rate limiter (useful for testing)
   */
  reset() {
    this.tokens = this.tokensPerInterval;
    this.lastRefill = Date.now();
  }

  /**
   * Get current state of the rate limiter
   * @returns {Object} Current tokens and last refill time
   */
  getState() {
    return {
      tokens: this.tokens,
      tokensPerInterval: this.tokensPerInterval,
      lastRefill: this.lastRefill,
    };
  }
}

export default NotionRateLimiter;

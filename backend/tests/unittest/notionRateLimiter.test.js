/**
 * Notion Rate Limiter Unit Tests
 *
 * Tests for token bucket rate limiting for Notion API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotionRateLimiter } from '../../utils/core/notionRateLimiter.js';

describe('NotionRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new NotionRateLimiter(3);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use provided rate limit', () => {
      const customLimiter = new NotionRateLimiter(2);
      const state = customLimiter.getState();

      expect(state.tokensPerInterval).toBe(2);
    });

    it('should cap rate limit at 3 req/sec for safety', () => {
      // Even if we try to set 10 req/sec, it should be capped at 3
      process.env.NOTION_API_RATE_LIMIT = '10';
      const envLimiter = new NotionRateLimiter();
      const state = envLimiter.getState();

      expect(state.tokensPerInterval).toBeLessThanOrEqual(3);
      delete process.env.NOTION_API_RATE_LIMIT;
    });

    it('should have initial tokens equal to tokensPerInterval', () => {
      const state = limiter.getState();

      expect(state.tokens).toBe(state.tokensPerInterval);
    });
  });

  describe('waitForToken', () => {
    it('should consume a token', async () => {
      const initialState = limiter.getState();
      const initialTokens = initialState.tokens;

      await limiter.waitForToken();

      const afterState = limiter.getState();
      expect(afterState.tokens).toBe(initialTokens - 1);
    });

    it('should enforce minimum delay between requests', async () => {
      // First request
      await limiter.waitForToken();
      const firstTime = Date.now();

      // Second request should be delayed
      const waitPromise = limiter.waitForToken();

      // Fast-forward by minimum delay
      await vi.advanceTimersByTimeAsync(400);
      await waitPromise;

      const secondTime = Date.now();
      expect(secondTime - firstTime).toBeGreaterThanOrEqual(400);
    });
  });

  describe('reset', () => {
    it('should reset tokens to full', async () => {
      // Consume some tokens
      await limiter.waitForToken();
      await vi.advanceTimersByTimeAsync(400);
      await limiter.waitForToken();

      const beforeReset = limiter.getState();
      expect(beforeReset.tokens).toBeLessThan(beforeReset.tokensPerInterval);

      // Reset
      limiter.reset();

      const afterReset = limiter.getState();
      expect(afterReset.tokens).toBe(afterReset.tokensPerInterval);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = limiter.getState();

      expect(state).toHaveProperty('tokens');
      expect(state).toHaveProperty('tokensPerInterval');
      expect(state).toHaveProperty('lastRefill');
    });

    it('should reflect token consumption', async () => {
      const before = limiter.getState().tokens;
      await limiter.waitForToken();
      const after = limiter.getState().tokens;

      expect(after).toBe(before - 1);
    });
  });

  describe('token refill', () => {
    it('should refill tokens after interval passes', async () => {
      // Consume all tokens
      for (let i = 0; i < 3; i++) {
        await limiter.waitForToken();
        await vi.advanceTimersByTimeAsync(400);
      }

      // Verify tokens are low
      expect(limiter.getState().tokens).toBe(0);

      // Advance time by 1 second (refill interval)
      await vi.advanceTimersByTimeAsync(1000);

      // Consume another token - should succeed after refill
      await limiter.waitForToken();

      // Should have consumed 1 token from refilled amount
      expect(limiter.getState().tokens).toBeLessThanOrEqual(3);
    });
  });
});

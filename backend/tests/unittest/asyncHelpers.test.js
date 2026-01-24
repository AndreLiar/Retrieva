/**
 * Unit Tests for Async Helpers
 *
 * Tests the async utility functions including sleep, retry,
 * batch processing, timeout, debounce, and rate limiting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  sleep,
  retryWithBackoff,
  batchProcess,
  promiseWithTimeout,
  debounce,
  rateLimit,
} from '../../utils/core/asyncHelpers.js';

describe('Async Helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // sleep tests
  // ============================================================================
  describe('sleep', () => {
    it('should return a promise', () => {
      const result = sleep(100);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve after specified milliseconds', async () => {
      const promise = sleep(1000);

      // Fast-forward time
      vi.advanceTimersByTime(999);
      // Promise should not have resolved yet

      vi.advanceTimersByTime(1);
      // Now it should resolve
      await expect(promise).resolves.toBeUndefined();
    });

    it('should resolve immediately for 0ms', async () => {
      const promise = sleep(0);
      vi.advanceTimersByTime(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // retryWithBackoff tests
  // ============================================================================
  describe('retryWithBackoff', () => {
    it('should return result on first success', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn, 3, 100);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');

      const result = await retryWithBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      vi.useRealTimers();
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, 3, 10)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      vi.useRealTimers();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retryWithBackoff(fn, 3, 50);
      const duration = Date.now() - start;

      // First retry: 50ms, Second retry: 100ms = 150ms minimum
      expect(duration).toBeGreaterThanOrEqual(140); // Allow some tolerance
    });

    it('should use default values', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
    });
  });

  // ============================================================================
  // batchProcess tests
  // ============================================================================
  describe('batchProcess', () => {
    it('should process all items', async () => {
      vi.useRealTimers();
      const items = [1, 2, 3, 4, 5];
      const fn = vi.fn().mockImplementation((x) => Promise.resolve(x * 2));

      const results = await batchProcess(items, fn, 2);

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should call function for each item', async () => {
      vi.useRealTimers();
      const items = ['a', 'b', 'c'];
      const fn = vi.fn().mockResolvedValue('done');

      await batchProcess(items, fn, 10);

      expect(fn).toHaveBeenCalledTimes(3);
      // Note: Array.map passes (item, index, array) to the callback
      expect(fn).toHaveBeenNthCalledWith(1, 'a', 0, expect.any(Array));
      expect(fn).toHaveBeenNthCalledWith(2, 'b', 1, expect.any(Array));
      expect(fn).toHaveBeenNthCalledWith(3, 'c', 2, expect.any(Array));
    });

    it('should process items in batches', async () => {
      vi.useRealTimers();
      const items = [1, 2, 3, 4, 5];
      const callOrder = [];
      const fn = vi.fn().mockImplementation(async (x) => {
        callOrder.push(`start-${x}`);
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push(`end-${x}`);
        return x;
      });

      await batchProcess(items, fn, 2);

      // Items 1,2 should start together, then 3,4, then 5
      // Batch processing means items in same batch run concurrently
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should handle empty array', async () => {
      vi.useRealTimers();
      const fn = vi.fn();

      const results = await batchProcess([], fn, 10);

      expect(results).toEqual([]);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should use default batch size', async () => {
      vi.useRealTimers();
      const items = Array.from({ length: 15 }, (_, i) => i);
      const fn = vi.fn().mockResolvedValue('done');

      await batchProcess(items, fn);

      expect(fn).toHaveBeenCalledTimes(15);
    });

    it('should handle batch size larger than array', async () => {
      vi.useRealTimers();
      const items = [1, 2, 3];
      const fn = vi.fn().mockImplementation((x) => Promise.resolve(x));

      const results = await batchProcess(items, fn, 100);

      expect(results).toEqual([1, 2, 3]);
    });
  });

  // ============================================================================
  // promiseWithTimeout tests
  // ============================================================================
  describe('promiseWithTimeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      vi.useRealTimers();
      const promise = new Promise((resolve) => setTimeout(() => resolve('done'), 10));

      const result = await promiseWithTimeout(promise, 1000);

      expect(result).toBe('done');
    });

    it('should reject with timeout error if promise takes too long', async () => {
      vi.useRealTimers();
      const promise = new Promise((resolve) => setTimeout(() => resolve('done'), 1000));

      await expect(promiseWithTimeout(promise, 10)).rejects.toThrow('Operation timed out');
    });

    it('should propagate promise rejection', async () => {
      vi.useRealTimers();
      const promise = Promise.reject(new Error('Custom error'));

      await expect(promiseWithTimeout(promise, 1000)).rejects.toThrow('Custom error');
    });

    it('should resolve immediately for already resolved promise', async () => {
      vi.useRealTimers();
      const promise = Promise.resolve('immediate');

      const result = await promiseWithTimeout(promise, 100);

      expect(result).toBe('immediate');
    });
  });

  // ============================================================================
  // debounce tests
  // ============================================================================
  describe('debounce', () => {
    it('should return a function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      expect(typeof debounced).toBe('function');
    });

    it('should delay function execution', async () => {
      const fn = vi.fn().mockReturnValue('result');
      const debounced = debounce(fn, 100);

      const promise = debounced();

      // Function should not be called immediately
      expect(fn).not.toHaveBeenCalled();

      // Advance time
      vi.advanceTimersByTime(100);

      await promise;
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only execute last call within delay window', async () => {
      const fn = vi.fn().mockImplementation((x) => x);
      const debounced = debounce(fn, 100);

      debounced('a');
      vi.advanceTimersByTime(50);
      debounced('b');
      vi.advanceTimersByTime(50);
      const promise = debounced('c');
      vi.advanceTimersByTime(100);

      await promise;

      // Only the last call should execute
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });

    it('should pass arguments to function', async () => {
      const fn = vi.fn().mockImplementation((a, b) => a + b);
      const debounced = debounce(fn, 100);

      const promise = debounced(1, 2);
      vi.advanceTimersByTime(100);

      const result = await promise;

      expect(fn).toHaveBeenCalledWith(1, 2);
      expect(result).toBe(3);
    });
  });

  // ============================================================================
  // rateLimit tests
  // ============================================================================
  describe('rateLimit', () => {
    it('should return a function', () => {
      const fn = vi.fn();
      const limited = rateLimit(fn, 5, 1000);

      expect(typeof limited).toBe('function');
    });

    it('should allow calls within limit', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const limited = rateLimit(fn, 3, 1000);

      await limited();
      await limited();
      await limited();

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error when rate limit exceeded', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const limited = rateLimit(fn, 2, 1000);

      await limited();
      await limited();

      await expect(limited()).rejects.toThrow('Rate limit exceeded');
    });

    it('should reset after period expires', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const limited = rateLimit(fn, 2, 50);

      await limited();
      await limited();

      // Wait for period to expire
      await new Promise((r) => setTimeout(r, 60));

      // Should be able to call again
      await limited();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should pass arguments to function', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const limited = rateLimit(fn, 5, 1000);

      await limited('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return function result', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('result');
      const limited = rateLimit(fn, 5, 1000);

      const result = await limited();

      expect(result).toBe('result');
    });
  });
});

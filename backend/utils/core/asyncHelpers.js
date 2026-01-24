/**
 * Async utilities for handling promises and delays
 */

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Initial delay in ms
 * @returns {Promise<any>}
 */
export const retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i);
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
};

/**
 * Execute promises in batches
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to apply to each item
 * @param {number} batchSize - Batch size
 * @returns {Promise<Array>}
 */
export const batchProcess = async (items, fn, batchSize = 10) => {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }

  return results;
};

/**
 * Execute async function with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
export const promiseWithTimeout = (promise, timeoutMs) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    ),
  ]);
};

/**
 * Debounce async function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function}
 */
export const debounce = (fn, delay) => {
  let timeoutId;

  return function (...args) {
    clearTimeout(timeoutId);
    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(fn.apply(this, args));
      }, delay);
    });
  };
};

/**
 * Rate limit function execution
 * @param {Function} fn - Function to rate limit
 * @param {number} maxCalls - Maximum calls per period
 * @param {number} period - Period in ms
 * @returns {Function}
 */
export const rateLimit = (fn, maxCalls, period) => {
  const calls = [];

  return async function (...args) {
    const now = Date.now();
    const validCalls = calls.filter((timestamp) => now - timestamp < period);

    if (validCalls.length >= maxCalls) {
      throw new Error('Rate limit exceeded');
    }

    calls.push(now);
    return await fn.apply(this, args);
  };
};

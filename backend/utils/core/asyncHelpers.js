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
 * LLM-specific timeout error for better error handling
 */
export class LLMTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`LLM ${operation} timed out after ${timeoutMs}ms`);
    this.name = 'LLMTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execute LLM chain invoke with timeout protection
 * @param {Object} chain - LangChain chain object
 * @param {Object} input - Input for the chain
 * @param {Object} options - Chain options (callbacks, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns {Promise<string>} Chain response
 */
export const invokeWithTimeout = async (chain, input, options = {}, timeoutMs = 60000) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LLMTimeoutError('invoke', timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([chain.invoke(input, options), timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * Execute LLM chain stream with timeout protection
 * Applies timeout to initial connection and between chunks
 * @param {Object} chain - LangChain chain object
 * @param {Object} input - Input for the chain
 * @param {Object} options - Chain options (callbacks, etc.)
 * @param {number} initialTimeoutMs - Timeout for first chunk (default: 30000)
 * @param {number} chunkTimeoutMs - Timeout between chunks (default: 10000)
 * @returns {AsyncGenerator<string>} Async generator yielding chunks
 */
export async function* streamWithTimeout(
  chain,
  input,
  options = {},
  initialTimeoutMs = 30000,
  chunkTimeoutMs = 10000
) {
  let timeoutId;
  let _isFirstChunk = true;

  const resetTimeout = (ms) => {
    if (timeoutId) clearTimeout(timeoutId);
    return new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new LLMTimeoutError('stream', ms));
      }, ms);
    });
  };

  try {
    const stream = await chain.stream(input, options);
    let _timeoutPromise = resetTimeout(initialTimeoutMs);

    for await (const chunk of stream) {
      // Cancel the timeout for this chunk
      clearTimeout(timeoutId);

      yield chunk;

      // Set timeout for next chunk (shorter after first chunk received)
      _isFirstChunk = false;
      _timeoutPromise = resetTimeout(chunkTimeoutMs);
    }

    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

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
    return fn.apply(this, args);
  };
};

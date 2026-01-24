import { ChatOllama } from '@langchain/ollama';
import dotenv from 'dotenv';
import { z } from 'zod';
import { guardrailsConfig } from './guardrails.js';
import logger from './logger.js';

dotenv.config();

/**
 * SECURITY FIX (API10:2023): Schema validation for LLM responses
 * Validates responses from Ollama to prevent malformed data from propagating
 */
const llmResponseSchema = z
  .object({
    content: z.string(),
    response_metadata: z
      .object({
        model: z.string().optional(),
        created_at: z.string().optional(),
        done: z.boolean().optional(),
        done_reason: z.string().optional(),
        total_duration: z.number().optional(),
        load_duration: z.number().optional(),
        prompt_eval_count: z.number().optional(),
        prompt_eval_duration: z.number().optional(),
        eval_count: z.number().optional(),
        eval_duration: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * LLM Configuration with Guardrails
 *
 * GUARDRAILS IMPLEMENTED:
 * - Temperature control (lower for factual queries)
 * - Max tokens limit
 * - Timeout configuration
 * - Stop sequences
 */

const generationConfig = guardrailsConfig.generation;

export const llm = new ChatOllama({
  model: process.env.LLM_MODEL || 'llama3.2:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // GUARDRAIL: Temperature control - lower for more factual responses
  temperature: process.env.LLM_TEMPERATURE
    ? parseFloat(process.env.LLM_TEMPERATURE)
    : generationConfig.temperature,

  // Sampling parameters
  top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 1,
  top_k: process.env.LLM_TOP_K ? parseInt(process.env.LLM_TOP_K) : 50,

  // GUARDRAIL: Max tokens limit to prevent runaway responses
  numPredict: process.env.LLM_MAX_TOKENS
    ? parseInt(process.env.LLM_MAX_TOKENS)
    : generationConfig.maxTokens,

  // GUARDRAIL: Stop sequences to prevent prompt leakage
  stop: generationConfig.stopSequences,
});

/**
 * Create LLM with custom timeout for long-running operations
 * @param {number} timeoutMs - Custom timeout in milliseconds
 * @returns {ChatOllama} LLM instance with custom timeout
 */
export function createLLMWithTimeout(timeoutMs = generationConfig.timeout) {
  return new ChatOllama({
    model: process.env.LLM_MODEL || 'llama3.2:latest',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    temperature: process.env.LLM_TEMPERATURE
      ? parseFloat(process.env.LLM_TEMPERATURE)
      : generationConfig.temperature,
    top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 1,
    top_k: process.env.LLM_TOP_K ? parseInt(process.env.LLM_TOP_K) : 50,
    numPredict: generationConfig.maxTokens,
    stop: generationConfig.stopSequences,
    // Note: Ollama doesn't have native timeout, but we can implement it at the request level
  });
}

/**
 * SECURITY FIX (LLM04): Wrap LLM call with proper cancellation
 * Uses AbortController to actually cancel the request, not just race against it.
 *
 * @param {Function} llmCall - Async function that calls the LLM, receives AbortSignal
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Result or timeout error
 */
export async function withTimeout(llmCall, timeoutMs = generationConfig.timeout) {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('LLM call aborted due to timeout', {
      service: 'llm',
      timeoutMs,
    });
  }, timeoutMs);

  try {
    // Pass the signal to the LLM call for proper cancellation
    const result = await llmCall(signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || signal.aborted) {
      throw new Error(`LLM call timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * SECURITY FIX (LLM04): Create a cancellable LLM invocation
 * Returns both the promise and an abort function for manual cancellation.
 *
 * @param {ChatOllama} llmInstance - LLM instance to use
 * @param {Array|string} input - Input messages or prompt
 * @param {Object} options - Additional options
 * @returns {Object} { promise, abort } - Promise and abort function
 */
export function createCancellableLLMCall(llmInstance, input, options = {}) {
  const controller = new AbortController();

  const promise = llmInstance.invoke(input, {
    ...options,
    signal: controller.signal,
  });

  return {
    promise,
    abort: () => {
      controller.abort();
      logger.info('LLM call manually aborted', { service: 'llm' });
    },
    signal: controller.signal,
  };
}

/**
 * SECURITY FIX (LLM04): Invoke LLM with timeout and proper cancellation
 *
 * @param {ChatOllama} llmInstance - LLM instance to use
 * @param {Array|string} input - Input messages or prompt
 * @param {Object} options - Additional options including timeout
 * @returns {Promise<Object>} LLM response
 */
export async function invokeWithTimeout(llmInstance, input, options = {}) {
  const { timeout = generationConfig.timeout, ...restOptions } = options;

  return withTimeout((signal) => llmInstance.invoke(input, { ...restOptions, signal }), timeout);
}

/**
 * Get LLM configuration for logging/debugging
 */
export function getLLMConfig() {
  return {
    model: process.env.LLM_MODEL || 'llama3.2:latest',
    temperature: generationConfig.temperature,
    maxTokens: generationConfig.maxTokens,
    timeout: generationConfig.timeout,
    stopSequences: generationConfig.stopSequences,
  };
}

/**
 * Judge LLM Configuration
 * Uses mistral for evaluating answer quality, hallucination detection, and grounding verification
 *
 * Separate from main LLM to allow different model selection for generation vs evaluation
 */
export const judgeLlm = new ChatOllama({
  model: process.env.JUDGE_LLM_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // Lower temperature for more consistent evaluations
  temperature: 0.1,

  // Limit output since we only need structured evaluation
  numPredict: 500,

  // Format as JSON for structured output
  format: 'json',
});

/**
 * Get Judge LLM configuration for logging/debugging
 */
export function getJudgeLLMConfig() {
  return {
    model: process.env.JUDGE_LLM_MODEL || 'mistral:latest',
    temperature: 0.1,
    maxTokens: 500,
    format: 'json',
  };
}

/**
 * SECURITY FIX (API10:2023): Validate LLM response from Ollama
 * Ensures the response conforms to expected schema before processing
 *
 * @param {Object} response - Raw response from LLM
 * @returns {Object} Validated response
 * @throws {Error} If response doesn't match expected schema
 */
export function validateLLMResponse(response) {
  const parseResult = llmResponseSchema.safeParse(response);

  if (!parseResult.success) {
    logger.warn('LLM response validation failed', {
      errors: parseResult.error.errors,
      responseKeys: response ? Object.keys(response) : [],
    });
    throw new Error('Invalid response structure from LLM');
  }

  // Additional content validation
  if (typeof parseResult.data.content !== 'string') {
    throw new Error('LLM response content must be a string');
  }

  return parseResult.data;
}

/**
 * SECURITY FIX (API10:2023): Wrap LLM invoke with response validation
 *
 * @param {ChatOllama} llmInstance - LLM instance to use
 * @param {Array|string} input - Input messages or prompt
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Validated LLM response
 */
export async function safeInvoke(llmInstance, input, options = {}) {
  const response = await llmInstance.invoke(input, options);
  return validateLLMResponse(response);
}

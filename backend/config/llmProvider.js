/**
 * LLM factory — thin client over the platform AI gateway (LiteLLM).
 *
 * Retrieva talks to ONE endpoint: the OpenAI-compatible gateway `/v1`. The gateway owns provider
 * routing (Ollama Cloud, Azure OpenAI, Bedrock…), key rotation, retries + fallbacks, PII masking,
 * budgets and EU governance — so the app carries none of that. Callers pick a MODEL NAME (a gateway
 * model or intent alias: tier-premium / tier-standard / ollama-cloud …) via `purpose`/`LLM_MODEL`;
 * the gateway resolves it. Config: `LITELLM_BASE_URL` + `LITELLM_API_KEY` (fallback to the existing
 * `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`, which already pointed at the gateway).
 *
 * Replaces the former multi-provider factory (per-provider clients + 3-key Ollama rotation +
 * withFallbacks) — all redundant now that the gateway provides it centrally.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import logger from './logger.js';

const guardrailsConfig = {
  generation: {
    temperature: 0.1,
    maxTokens: 2048,
    stopSequences: [],
    seed: null,
    timeout: 60000,
  },
};

dotenv.config();

// The single provider retrieva talks to: the platform AI gateway (LiteLLM), OpenAI-compatible.
// The gateway owns everything the app used to duplicate — provider routing (Ollama Cloud, Azure,
// Bedrock…), key rotation, num_retries + fallbacks, PII masking, budgets and EU governance — so
// retrieva no longer carries per-provider clients or its own fallback/rotation logic. Callers pick
// a MODEL NAME (a gateway model or intent alias: tier-premium / tier-standard / ollama-cloud …);
// the gateway resolves it to the right underlying model, keeping the app env-agnostic and governed.
export const LLM_PROVIDERS = { LITELLM: 'litellm' };

// Supported per-call purposes — callers pick the right speed/quality tradeoff by MODEL, not by
// provider (the provider is always the gateway).
export const LLM_PURPOSES = ['chat', 'analysis', 'judge', 'formatter'];

// AI gateway endpoint + key. Canonical: LITELLM_BASE_URL / LITELLM_API_KEY. For a smooth cutover we
// also accept the pre-existing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY (they already pointed at
// the gateway) and a generic OPENAI_API_BASE / OPENAI_API_KEY. baseURL is normalised to end in /v1.
function normaliseGatewayUrl(u) {
  if (!u) return u;
  const trimmed = u.replace(/\/+$/, '');
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}
const GATEWAY_BASE_URL = normaliseGatewayUrl(
  process.env.LITELLM_BASE_URL || process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_API_BASE
);
const GATEWAY_API_KEY =
  process.env.LITELLM_API_KEY || process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

// Per-purpose model resolution: LLM_<PURPOSE>_MODEL overrides the global LLM_MODEL. These are gateway
// model names / intent aliases (e.g. prod: tier-premium + JUDGE=tier-standard; dev: ollama-cloud).
function resolveModelForPurpose(purpose) {
  const upper = purpose.toUpperCase();
  return process.env[`LLM_${upper}_MODEL`] || process.env.LLM_MODEL;
}

/**
 * Provider configuration schema
 */
const providerConfigSchema = z.object({
  provider: z.literal('litellm'),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
});

/**
 * LLM response validation schema
 */
const llmResponseSchema = z
  .object({
    content: z.string(),
    response_metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

/**
 * The active provider is always the gateway. Kept for callers/telemetry that read it.
 */
export function getCurrentProvider() {
  return LLM_PROVIDERS.LITELLM;
}

/**
 * Create a chat client pointed at the platform AI gateway (LiteLLM, OpenAI-compatible /v1).
 * ONE client, no per-provider branching / key rotation / fallback here — the gateway owns all of
 * that. `model` is a gateway model name or intent alias (tier-premium, tier-standard, ollama-cloud…).
 */
async function createGatewayLLM(config) {
  const { ChatOpenAI } = await import('@langchain/openai');
  if (!GATEWAY_BASE_URL) {
    throw new Error(
      'AI gateway URL is required. Set LITELLM_BASE_URL (or AZURE_OPENAI_ENDPOINT) to the LiteLLM endpoint.'
    );
  }
  const model = config.model;
  if (!model) {
    throw new Error(
      'LLM model is required. Set LLM_MODEL (or LLM_<PURPOSE>_MODEL) to a gateway model name.'
    );
  }
  const seed = config.seed ?? guardrailsConfig.generation.seed;
  logger.info('Creating LLM via AI gateway', {
    service: 'llm-provider',
    baseURL: GATEWAY_BASE_URL,
    model,
  });
  return new ChatOpenAI({
    model,
    apiKey: config.apiKey || GATEWAY_API_KEY,
    configuration: { baseURL: config.baseUrl || GATEWAY_BASE_URL },
    temperature: config.temperature ?? guardrailsConfig.generation.temperature,
    maxTokens: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
    stop: guardrailsConfig.generation.stopSequences,
    ...(seed !== null && seed !== undefined && { seed }),
  });
}

/**
 * LLM Provider Factory
 * Creates LLM instances based on provider configuration.
 *
 * `purpose` lets callers pick a per-workload provider/model without touching
 * the global LLM_PROVIDER. e.g. chat → fast inference (Groq), analysis →
 * quality-first (Ollama Cloud + gemma3:12b). Defaults preserve current behavior.
 *
 * @param {Object} config
 * @param {'chat'|'analysis'|'judge'|'formatter'} [config.purpose='analysis']
 * @param {string} [config.provider] - Explicit override (skips purpose lookup)
 * @param {string} [config.model] - Explicit override (skips purpose lookup)
 * @param {number} [config.temperature]
 * @param {number} [config.maxTokens]
 * @param {string} [config.baseUrl]
 * @param {string} [config.apiKey]
 * @returns {Promise<Object>} LLM instance (may be a withFallbacks chain)
 */
export async function createLLM(config = {}) {
  const { purpose = 'analysis', ...rest } = config;
  const model = rest.model || resolveModelForPurpose(purpose);
  const resolvedConfig = { ...rest, provider: LLM_PROVIDERS.LITELLM, model };

  // Validate config (non-fatal — surfaces a bad model/config in logs)
  const validationResult = providerConfigSchema.safeParse(resolvedConfig);
  if (!validationResult.success) {
    logger.warn('Invalid LLM config', { errors: validationResult.error.errors });
  }

  // Single path: everything goes through the AI gateway. The gateway handles provider routing,
  // key rotation, retries and fallbacks (num_retries/allowed_fails/fallbacks in its config), so the
  // app no longer needs a per-provider switch or a chat fast-path/fallback chain of its own.
  return createGatewayLLM(resolvedConfig);
}

/**
 * Resolve the active model for a given purpose without instantiating an LLM. Used by request-time
 * telemetry to log which gateway model handled a call. The provider is always the gateway.
 */
export function getActiveLLMMeta(purpose = 'analysis') {
  const model = resolveModelForPurpose(purpose) || 'default';
  return { provider: LLM_PROVIDERS.LITELLM, model, purpose };
}

/**
 * Create the default LLM instance based on environment configuration
 * This is the main entry point for the application
 */
let defaultLLM = null;
let judgeLLM = null;

export async function getDefaultLLM() {
  if (!defaultLLM) {
    defaultLLM = await createLLM();
  }
  return defaultLLM;
}

/**
 * Get Judge LLM for evaluation tasks
 * Uses a separate model for answer quality evaluation
 */
export async function getJudgeLLM() {
  if (!judgeLLM) {
    // Judge model is a gateway model name: JUDGE_LLM_MODEL (e.g. tier-standard) → LLM_MODEL.
    const judgeModel =
      process.env.LLM_JUDGE_MODEL || process.env.JUDGE_LLM_MODEL || process.env.LLM_MODEL;

    judgeLLM = await createLLM({
      purpose: 'judge',
      model: judgeModel,
      temperature: 0.1,
      maxTokens: 500,
    });
  }
  return judgeLLM;
}

/**
 * Reset cached LLM instances (useful for testing or reconfiguration)
 */
export function resetLLMInstances() {
  defaultLLM = null;
  judgeLLM = null;
  logger.info('LLM instances reset');
}

/**
 * Validate LLM response
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

  if (typeof parseResult.data.content !== 'string') {
    throw new Error('LLM response content must be a string');
  }

  return parseResult.data;
}

/**
 * Invoke LLM with timeout and proper cancellation
 */
export async function invokeWithTimeout(llmInstance, input, options = {}) {
  const { timeout = guardrailsConfig.generation.timeout, ...restOptions } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('LLM call aborted due to timeout', { timeout });
  }, timeout);

  try {
    const result = await llmInstance.invoke(input, { ...restOptions, signal });
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || signal.aborted) {
      throw new Error(`LLM call timed out after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Create cancellable LLM call
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
      logger.info('LLM call manually aborted');
    },
    signal: controller.signal,
  };
}

/**
 * Get provider configuration for logging/debugging
 */
export function getProviderConfig() {
  const provider = getCurrentProvider();
  return {
    provider,
    model: process.env.LLM_MODEL || 'default',
    judgeModel: process.env.JUDGE_LLM_MODEL || 'default',
    temperature: guardrailsConfig.generation.temperature,
    maxTokens: guardrailsConfig.generation.maxTokens,
    timeout: guardrailsConfig.generation.timeout,
  };
}

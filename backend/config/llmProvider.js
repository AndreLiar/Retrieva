/**
 * LLM Provider Abstraction Factory
 *
 * Allows switching between LLM providers (Ollama cloud, OpenAI, Anthropic)
 * via environment configuration without code changes.
 *
 * Default: Ollama cloud (https://ollama.com) with 3-key rotation — if the
 * active key hits a rate limit the next key is tried automatically via
 * LangChain's withFallbacks().
 */

import { ChatOllama } from '@langchain/ollama';
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

// Supported LLM providers
export const LLM_PROVIDERS = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GROQ: 'groq',
};

// Supported per-call purposes — let callers pick the right speed/quality tradeoff
// without changing the global LLM_PROVIDER.
export const LLM_PURPOSES = ['chat', 'analysis', 'judge', 'formatter'];

// Per-purpose env override resolution. Callers pass `purpose: 'chat'` and we look
// up LLM_CHAT_PROVIDER / LLM_CHAT_MODEL first, falling back to the global vars so
// existing deployments behave the same until per-purpose overrides are set.
function resolveProviderForPurpose(purpose) {
  const upper = purpose.toUpperCase();
  return process.env[`LLM_${upper}_PROVIDER`] || process.env.LLM_PROVIDER || LLM_PROVIDERS.OLLAMA;
}

function resolveModelForPurpose(purpose, provider) {
  const upper = purpose.toUpperCase();
  const explicit = process.env[`LLM_${upper}_MODEL`] || process.env.LLM_MODEL;
  if (explicit) return explicit;
  if (provider === LLM_PROVIDERS.GROQ) return 'llama-3.1-8b-instant';
  return undefined;
}

// Ollama cloud configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
const OLLAMA_CLOUD_KEYS = [
  process.env.OLLAMA_API_KEY_1,
  process.env.OLLAMA_API_KEY_2,
  process.env.OLLAMA_API_KEY_3,
].filter(Boolean);

/**
 * Provider configuration schema
 */
const providerConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'groq']),
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
 * Get current provider from environment
 */
export function getCurrentProvider() {
  const provider = process.env.LLM_PROVIDER || LLM_PROVIDERS.OLLAMA;
  if (!Object.values(LLM_PROVIDERS).includes(provider)) {
    logger.warn(`Unknown LLM provider: ${provider}, falling back to Ollama`);
    return LLM_PROVIDERS.OLLAMA;
  }
  return provider;
}

/**
 * Create Ollama cloud LLM with automatic key rotation.
 *
 * Builds one ChatOllama instance per OLLAMA_API_KEY_* and chains them with
 * withFallbacks() — when key 1 gets a rate limit (or any error), LangChain
 * transparently retries with key 2, then key 3. Falls back to unauthenticated
 * if no keys are configured (local Ollama).
 */
function createOllamaLLM(config) {
  const baseUrl = config.baseUrl || OLLAMA_BASE_URL;
  const model = config.model || process.env.LLM_MODEL || 'llama3.2:latest';

  const instanceConfig = {
    model,
    baseUrl,
    temperature: config.temperature ?? guardrailsConfig.generation.temperature,
    numPredict: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
    top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 1,
    top_k: process.env.LLM_TOP_K ? parseInt(process.env.LLM_TOP_K) : 50,
    stop: guardrailsConfig.generation.stopSequences,
  };

  if (OLLAMA_CLOUD_KEYS.length === 0) {
    logger.info('Creating Ollama LLM (unauthenticated / self-hosted)', {
      service: 'llm-provider',
      baseUrl,
      model,
    });
    return new ChatOllama(instanceConfig);
  }

  logger.info('Creating Ollama cloud LLM with key rotation', {
    service: 'llm-provider',
    baseUrl,
    model,
    keyCount: OLLAMA_CLOUD_KEYS.length,
  });

  // Each key gets its own instance; the API key travels as a Bearer token
  const instances = OLLAMA_CLOUD_KEYS.map(
    (key) => new ChatOllama({ ...instanceConfig, headers: { Authorization: `Bearer ${key}` } })
  );

  const [primary, ...fallbacks] = instances;
  if (fallbacks.length === 0) return primary;

  const chain = primary.withFallbacks({ fallbacks });
  // RunnableWithFallbacks doesn't inherit bindTools — proxy it so createReactAgent works
  chain.bindTools = (tools, kwargs) => {
    const boundPrimary = primary.bindTools(tools, kwargs);
    const boundFallbacks = fallbacks.map((f) => f.bindTools(tools, kwargs));
    const boundChain = boundPrimary.withFallbacks({ fallbacks: boundFallbacks });
    boundChain.bindTools = chain.bindTools;
    return boundChain;
  };
  return chain;
}

/**
 * Create OpenAI LLM instance (lazy load to avoid dependency if not used)
 */
async function createOpenAILLM(config) {
  try {
    const { ChatOpenAI } = await import('@langchain/openai');

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
    }

    // Seed for reproducibility (OpenAI supports seed parameter)
    const seed = config.seed ?? guardrailsConfig.generation.seed;

    return new ChatOpenAI({
      modelName: config.model || process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      openAIApiKey: apiKey,
      temperature: config.temperature ?? guardrailsConfig.generation.temperature,
      maxTokens: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
      stop: guardrailsConfig.generation.stopSequences,
      ...(seed !== null && { seed }), // Only include seed if set
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'OpenAI provider requires @langchain/openai package. Install with: npm install @langchain/openai'
      );
    }
    throw error;
  }
}

/**
 * Create Anthropic LLM instance (lazy load to avoid dependency if not used)
 */
async function createAnthropicLLM(config) {
  try {
    const { ChatAnthropic } = await import('@langchain/anthropic');

    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.');
    }

    return new ChatAnthropic({
      modelName: config.model || process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
      anthropicApiKey: apiKey,
      temperature: config.temperature ?? guardrailsConfig.generation.temperature,
      maxTokens: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
      stopSequences: guardrailsConfig.generation.stopSequences,
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Anthropic provider requires @langchain/anthropic package. Install with: npm install @langchain/anthropic'
      );
    }
    throw error;
  }
}

/**
 * Create Groq LLM instance via OpenAI-compatible API.
 *
 * Groq exposes an OpenAI-compatible endpoint, so we reuse @langchain/openai's
 * ChatOpenAI client by pointing baseURL at api.groq.com. This is the fast path
 * for chat workloads (~10x faster than Ollama Cloud at the small-model tier).
 */
async function createGroqLLM(config) {
  try {
    const { ChatOpenAI } = await import('@langchain/openai');

    const apiKey = config.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key is required. Set GROQ_API_KEY environment variable.');
    }

    return new ChatOpenAI({
      apiKey,
      model: config.model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      configuration: { baseURL: 'https://api.groq.com/openai/v1' },
      temperature: config.temperature ?? guardrailsConfig.generation.temperature,
      maxTokens: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Groq provider requires @langchain/openai package. Install with: npm install @langchain/openai'
      );
    }
    throw error;
  }
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
  const provider = rest.provider || resolveProviderForPurpose(purpose);
  const model = rest.model || resolveModelForPurpose(purpose, provider);
  const resolvedConfig = { ...rest, provider, model };

  // Validate config
  const validationResult = providerConfigSchema.safeParse(resolvedConfig);
  if (!validationResult.success && rest.provider) {
    logger.warn('Invalid LLM config, using defaults', {
      errors: validationResult.error.errors,
    });
  }

  logger.info(`Creating LLM with provider: ${provider}`, {
    model: model || 'default',
    purpose,
    temperature: rest.temperature,
  });

  // Chat fast-path: Groq primary, Ollama fallback. Keeps the chat experience
  // alive when Groq returns 429/5xx without callers having to handle it.
  if (purpose === 'chat' && provider === LLM_PROVIDERS.GROQ && process.env.GROQ_API_KEY) {
    const fast = await createGroqLLM(resolvedConfig);
    const fallbackProvider = process.env.LLM_PROVIDER || LLM_PROVIDERS.OLLAMA;
    const fallbackModel = process.env.LLM_MODEL || undefined;
    const fallback = await createLLM({
      purpose: 'analysis',
      provider: fallbackProvider,
      model: fallbackModel,
      temperature: rest.temperature,
      maxTokens: rest.maxTokens,
    });
    return fast.withFallbacks({ fallbacks: [fallback] });
  }

  switch (provider) {
    case LLM_PROVIDERS.GROQ:
      return createGroqLLM(resolvedConfig);

    case LLM_PROVIDERS.OPENAI:
      return createOpenAILLM(resolvedConfig);

    case LLM_PROVIDERS.ANTHROPIC:
      return createAnthropicLLM(resolvedConfig);

    case LLM_PROVIDERS.OLLAMA:
    default:
      return createOllamaLLM(resolvedConfig);
  }
}

/**
 * Resolve the active provider + model for a given purpose without instantiating
 * an LLM. Used by request-time telemetry so we can log which model handled a
 * call even when the underlying instance is cached/wrapped in withFallbacks.
 */
export function getActiveLLMMeta(purpose = 'analysis') {
  const provider = resolveProviderForPurpose(purpose);
  const model = resolveModelForPurpose(purpose, provider) || 'default';
  return { provider, model, purpose };
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
    const provider = process.env.LLM_JUDGE_PROVIDER || getCurrentProvider();
    const judgeModel =
      process.env.LLM_JUDGE_MODEL ||
      process.env.JUDGE_LLM_MODEL ||
      (provider === LLM_PROVIDERS.OPENAI
        ? 'gpt-4-turbo-preview'
        : provider === LLM_PROVIDERS.ANTHROPIC
          ? 'claude-3-haiku-20240307'
          : process.env.LLM_MODEL || 'mistral:latest');

    judgeLLM = await createLLM({
      purpose: 'judge',
      provider,
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

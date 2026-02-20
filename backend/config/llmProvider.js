/**
 * LLM Provider Abstraction Factory
 *
 * Allows switching between LLM providers (Ollama, OpenAI, Anthropic, Azure)
 * via environment configuration without code changes.
 *
 * SECURITY: Provider abstraction enables:
 * - Easy provider switching for compliance requirements
 * - Fallback providers for high availability
 * - Cost optimization by provider selection
 */

import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import dotenv from 'dotenv';
import { guardrailsConfig } from './guardrails.js';
import logger from './logger.js';

dotenv.config();

// Supported LLM providers
export const LLM_PROVIDERS = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  AZURE_OPENAI: 'azure_openai',
};

/**
 * Provider configuration schema
 */
const providerConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'azure_openai']),
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
 * Create Ollama LLM instance
 */
function createOllamaLLM(config) {
  return new ChatOllama({
    model: config.model || process.env.LLM_MODEL || 'llama3.2:latest',
    baseUrl: config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    temperature: config.temperature ?? guardrailsConfig.generation.temperature,
    numPredict: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
    top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 1,
    top_k: process.env.LLM_TOP_K ? parseInt(process.env.LLM_TOP_K) : 50,
    stop: guardrailsConfig.generation.stopSequences,
  });
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
 * Create Azure OpenAI LLM instance (lazy load to avoid dependency if not used)
 */
async function createAzureOpenAILLM(config) {
  try {
    const { AzureChatOpenAI } = await import('@langchain/openai');

    const apiKey = config.apiKey || process.env.AZURE_OPENAI_API_KEY;
    const endpoint = config.baseUrl || process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = config.model || process.env.AZURE_OPENAI_LLM_DEPLOYMENT;

    if (!apiKey || !endpoint || !deploymentName) {
      throw new Error(
        'Azure OpenAI requires AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_LLM_DEPLOYMENT environment variables.'
      );
    }

    // Seed for reproducibility (Azure OpenAI supports seed parameter)
    const seed = config.seed ?? guardrailsConfig.generation.seed;

    logger.info('Creating Azure OpenAI LLM', {
      service: 'llm-provider',
      deployment: deploymentName,
      endpoint: endpoint.replace(/https?:\/\//, '').split('.')[0], // Log instance name only
      hasSeed: seed !== null,
    });

    return new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIEndpoint: endpoint,
      azureOpenAIApiDeploymentName: deploymentName,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
      temperature: config.temperature ?? guardrailsConfig.generation.temperature,
      maxTokens: config.maxTokens ?? guardrailsConfig.generation.maxTokens,
      stop: guardrailsConfig.generation.stopSequences,
      ...(seed !== null && { seed }), // Only include seed if set
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Azure OpenAI provider requires @langchain/openai package. Install with: npm install @langchain/openai'
      );
    }
    throw error;
  }
}

/**
 * LLM Provider Factory
 * Creates LLM instances based on provider configuration
 *
 * @param {Object} config - Configuration options
 * @param {string} config.provider - Provider name (ollama, openai, anthropic, azure_openai)
 * @param {string} config.model - Model name
 * @param {number} config.temperature - Temperature for generation
 * @param {number} config.maxTokens - Maximum tokens
 * @param {string} config.baseUrl - Base URL (for Ollama or Azure)
 * @param {string} config.apiKey - API key (for OpenAI, Anthropic, Azure)
 * @returns {Promise<Object>} LLM instance
 */
export async function createLLM(config = {}) {
  const provider = config.provider || getCurrentProvider();

  // Validate config
  const validationResult = providerConfigSchema.safeParse({ ...config, provider });
  if (!validationResult.success && config.provider) {
    logger.warn('Invalid LLM config, using defaults', {
      errors: validationResult.error.errors,
    });
  }

  logger.info(`Creating LLM with provider: ${provider}`, {
    model: config.model || 'default',
    temperature: config.temperature,
  });

  switch (provider) {
    case LLM_PROVIDERS.OPENAI:
      return createOpenAILLM(config);

    case LLM_PROVIDERS.ANTHROPIC:
      return createAnthropicLLM(config);

    case LLM_PROVIDERS.AZURE_OPENAI:
      return createAzureOpenAILLM(config);

    case LLM_PROVIDERS.OLLAMA:
    default:
      return createOllamaLLM(config);
  }
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
    const provider = getCurrentProvider();
    const judgeModel =
      process.env.JUDGE_LLM_MODEL ||
      (provider === LLM_PROVIDERS.OLLAMA
        ? 'mistral:latest'
        : provider === LLM_PROVIDERS.OPENAI
          ? 'gpt-4-turbo-preview'
          : provider === LLM_PROVIDERS.ANTHROPIC
            ? 'claude-3-haiku-20240307'
            : provider === LLM_PROVIDERS.AZURE_OPENAI
              ? process.env.AZURE_OPENAI_LLM_DEPLOYMENT
              : 'mistral:latest');

    judgeLLM = await createLLM({
      provider,
      model: judgeModel,
      temperature: 0.1, // Lower for consistent evaluations
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

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// These maintain compatibility with existing code using the old llm.js exports
// ============================================================================

// Synchronous exports for backward compatibility
// These use Ollama directly (the default provider)
const generationConfig = guardrailsConfig.generation;

export const llm = new ChatOllama({
  model: process.env.LLM_MODEL || 'llama3.2:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: process.env.LLM_TEMPERATURE
    ? parseFloat(process.env.LLM_TEMPERATURE)
    : generationConfig.temperature,
  top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 1,
  top_k: process.env.LLM_TOP_K ? parseInt(process.env.LLM_TOP_K) : 50,
  numPredict: process.env.LLM_MAX_TOKENS
    ? parseInt(process.env.LLM_MAX_TOKENS)
    : generationConfig.maxTokens,
  stop: generationConfig.stopSequences,
});

export const judgeLlm = new ChatOllama({
  model: process.env.JUDGE_LLM_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.1,
  numPredict: 500,
  format: 'json',
});

export function createLLMWithTimeout(_timeoutMs = generationConfig.timeout) {
  return createOllamaLLM({ maxTokens: generationConfig.maxTokens });
}

export async function withTimeout(llmCall, timeoutMs = generationConfig.timeout) {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('LLM call aborted due to timeout', { timeoutMs });
  }, timeoutMs);

  try {
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

export function getLLMConfig() {
  return getProviderConfig();
}

export function getJudgeLLMConfig() {
  return {
    provider: getCurrentProvider(),
    model: process.env.JUDGE_LLM_MODEL || 'mistral:latest',
    temperature: 0.1,
    maxTokens: 500,
    format: 'json',
  };
}

export async function safeInvoke(llmInstance, input, options = {}) {
  const response = await llmInstance.invoke(input, options);
  return validateLLMResponse(response);
}

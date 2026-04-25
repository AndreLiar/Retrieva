/**
 * LLM Configuration Module
 *
 * This module re-exports from the LLM Provider abstraction for backward compatibility.
 * New code should use the provider factory directly from './llmProvider.js'
 *
 * The provider abstraction allows switching between:
 * - OpenRouter (default — 3-key rotation for rate limit resilience)
 * - Ollama (cloud at https://ollama.com or self-hosted)
 * - OpenAI
 * - Anthropic
 *
 * Configure via environment variables:
 * - LLM_PROVIDER: 'openrouter' | 'ollama' | 'openai' | 'anthropic'
 * - LLM_MODEL: Model name (provider-specific)
 * - OPENROUTER_API_KEY_1/2/3: For OpenRouter provider
 * - OPENAI_API_KEY: For OpenAI provider
 * - ANTHROPIC_API_KEY: For Anthropic provider
 */

// Re-export from the provider abstraction
export {
  createLLM,
  getDefaultLLM,
  getJudgeLLM,
  resetLLMInstances,
  getCurrentProvider,
  getProviderConfig,
  LLM_PROVIDERS,
  invokeWithTimeout,
  createCancellableLLMCall,
  validateLLMResponse,
} from './llmProvider.js';

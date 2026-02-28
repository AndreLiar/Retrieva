/**
 * LLM Configuration Module
 *
 * This module re-exports from the LLM Provider abstraction for backward compatibility.
 * New code should use the provider factory directly from './llmProvider.js'
 *
 * The provider abstraction allows switching between:
 * - Ollama (default, local)
 * - OpenAI
 * - Anthropic
 * - Azure OpenAI
 *
 * Configure via environment variables:
 * - LLM_PROVIDER: 'ollama' | 'openai' | 'anthropic' | 'azure_openai'
 * - LLM_MODEL: Model name (provider-specific)
 * - OPENAI_API_KEY: For OpenAI provider
 * - ANTHROPIC_API_KEY: For Anthropic provider
 * - AZURE_OPENAI_*: For Azure OpenAI provider
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

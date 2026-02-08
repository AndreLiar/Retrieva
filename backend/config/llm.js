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

// Re-export everything from the provider abstraction
export {
  // Provider factory (recommended for new code)
  createLLM,
  getDefaultLLM,
  getJudgeLLM,
  resetLLMInstances,
  getCurrentProvider,
  getProviderConfig,
  LLM_PROVIDERS,

  // Backward compatible exports
  llm,
  judgeLlm,
  createLLMWithTimeout,
  withTimeout,
  invokeWithTimeout,
  createCancellableLLMCall,
  validateLLMResponse,
  safeInvoke,
  getLLMConfig,
  getJudgeLLMConfig,
} from './llmProvider.js';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_CHAT_PROVIDER',
  'LLM_CHAT_MODEL',
  'LLM_FORMATTER_PROVIDER',
  'LLM_FORMATTER_MODEL',
  'LLM_ANALYSIS_PROVIDER',
  'LLM_ANALYSIS_MODEL',
  'LLM_JUDGE_PROVIDER',
  'LLM_JUDGE_MODEL',
  'JUDGE_LLM_MODEL',
  'GROQ_API_KEY',
  'OLLAMA_API_KEY_1',
  'OLLAMA_API_KEY_2',
  'OLLAMA_API_KEY_3',
];

let savedEnv;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  // Pre-seed Ollama keys to '' so dotenv.config() (called at module import in
  // llmProvider.js) doesn't repopulate them from backend/.env. The provider
  // filters falsy keys out, so the unauthenticated path is taken.
  process.env.OLLAMA_API_KEY_1 = '';
  process.env.OLLAMA_API_KEY_2 = '';
  process.env.OLLAMA_API_KEY_3 = '';
  process.env.GROQ_API_KEY = '';
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.resetModules();
});

describe('createLLM purpose dispatch', () => {
  it('returns a Groq instance when LLM_CHAT_PROVIDER=groq and purpose=chat', async () => {
    process.env.LLM_CHAT_PROVIDER = 'groq';
    process.env.LLM_CHAT_MODEL = 'llama-3.1-8b-instant';
    process.env.GROQ_API_KEY = 'test-key';
    process.env.LLM_PROVIDER = 'ollama';

    const fakeChatOpenAI = vi.fn(function () {
      this.kind = 'groq';
      this.withFallbacks = ({ fallbacks }) => ({
        kind: 'fallback-chain',
        primary: this,
        fallbacks,
      });
    });
    vi.doMock('@langchain/openai', () => ({ ChatOpenAI: fakeChatOpenAI }));
    const fakeChatOllama = vi.fn(function () {
      this.kind = 'ollama';
      this.bindTools = () => this;
    });
    vi.doMock('@langchain/ollama', () => ({ ChatOllama: fakeChatOllama }));

    const { createLLM } = await import('../../config/llmProvider.js');
    const llm = await createLLM({ purpose: 'chat' });

    expect(llm.kind).toBe('fallback-chain');
    expect(llm.primary.kind).toBe('groq');
    expect(llm.fallbacks).toHaveLength(1);
    expect(llm.fallbacks[0].kind).toBe('ollama');
    // Groq received the right model + baseURL
    const ctorArgs = fakeChatOpenAI.mock.calls[0][0];
    expect(ctorArgs.model).toBe('llama-3.1-8b-instant');
    expect(ctorArgs.configuration.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(ctorArgs.apiKey).toBe('test-key');
  });

  it('falls back to LLM_PROVIDER when no per-purpose override is set', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_MODEL = 'gemma3:12b';

    const fakeChatOllama = vi.fn(function () {
      this.kind = 'ollama';
      this.bindTools = () => this;
    });
    vi.doMock('@langchain/ollama', () => ({ ChatOllama: fakeChatOllama }));

    const { createLLM } = await import('../../config/llmProvider.js');
    const llm = await createLLM({ purpose: 'analysis' });

    expect(llm.kind).toBe('ollama');
    expect(fakeChatOllama).toHaveBeenCalledTimes(1);
    expect(fakeChatOllama.mock.calls[0][0].model).toBe('gemma3:12b');
  });

  it('throws a clear error if Groq selected without GROQ_API_KEY', async () => {
    process.env.LLM_CHAT_PROVIDER = 'groq';
    // GROQ_API_KEY intentionally missing — fallback wrapper is gated on the key,
    // so we hit the bare createGroqLLM path which must throw.

    vi.doMock('@langchain/openai', () => ({ ChatOpenAI: vi.fn() }));

    const { createLLM } = await import('../../config/llmProvider.js');
    await expect(createLLM({ purpose: 'chat' })).rejects.toThrow(/GROQ_API_KEY/);
  });

  it('keeps gap-analysis on Ollama when only chat overrides are set', async () => {
    process.env.LLM_CHAT_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-key';
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_MODEL = 'gemma3:12b';

    const fakeChatOllama = vi.fn(function () {
      this.kind = 'ollama';
      this.bindTools = () => this;
    });
    vi.doMock('@langchain/ollama', () => ({ ChatOllama: fakeChatOllama }));

    const { createLLM } = await import('../../config/llmProvider.js');
    const llm = await createLLM({ purpose: 'analysis' });

    expect(llm.kind).toBe('ollama');
    expect(fakeChatOllama.mock.calls[0][0].model).toBe('gemma3:12b');
  });

  it('getActiveLLMMeta reflects the resolved provider/model for a purpose', async () => {
    process.env.LLM_CHAT_PROVIDER = 'groq';
    process.env.LLM_CHAT_MODEL = 'llama-3.1-8b-instant';
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_MODEL = 'gemma3:12b';

    const { getActiveLLMMeta } = await import('../../config/llmProvider.js');

    expect(getActiveLLMMeta('chat')).toEqual({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      purpose: 'chat',
    });
    expect(getActiveLLMMeta('analysis')).toEqual({
      provider: 'ollama',
      model: 'gemma3:12b',
      purpose: 'analysis',
    });
  });
});

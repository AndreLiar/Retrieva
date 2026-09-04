import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The LLM factory is now a thin client over the AI gateway (LiteLLM). There is no per-provider
// dispatch, key rotation or fallback chain in the app — the gateway owns all of that. These tests
// assert the gateway contract: one ChatOpenAI pointed at the gateway /v1, model resolved per
// purpose (LLM_<PURPOSE>_MODEL → LLM_MODEL), provider always 'litellm'.

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_CHAT_MODEL',
  'LLM_FORMATTER_MODEL',
  'LLM_ANALYSIS_MODEL',
  'LLM_JUDGE_MODEL',
  'JUDGE_LLM_MODEL',
  'LITELLM_BASE_URL',
  'LITELLM_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'OPENAI_API_BASE',
  'OPENAI_API_KEY',
];

let savedEnv;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  // Canonical gateway config for the tests.
  process.env.LITELLM_BASE_URL = 'http://litellm.ai.svc.cluster.local:4000';
  process.env.LITELLM_API_KEY = 'sk-test-gateway';
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.resetModules();
});

function mockChatOpenAI() {
  const ctor = vi.fn(function (args) {
    this.kind = 'gateway';
    this.args = args;
  });
  vi.doMock('@langchain/openai', () => ({ ChatOpenAI: ctor }));
  return ctor;
}

describe('createLLM — routes everything through the AI gateway', () => {
  it('builds one ChatOpenAI pointed at the gateway /v1 with the resolved model + key', async () => {
    process.env.LLM_MODEL = 'tier-premium';
    const ctor = mockChatOpenAI();

    const { createLLM } = await import('../../config/llmProvider.js');
    const llm = await createLLM({ purpose: 'analysis' });

    expect(llm.kind).toBe('gateway');
    const args = ctor.mock.calls[0][0];
    expect(args.model).toBe('tier-premium');
    // baseURL normalised to end in /v1
    expect(args.configuration.baseURL).toBe('http://litellm.ai.svc.cluster.local:4000/v1');
    expect(args.apiKey).toBe('sk-test-gateway');
  });

  it('per-purpose model overrides the global LLM_MODEL', async () => {
    process.env.LLM_MODEL = 'tier-premium';
    process.env.LLM_CHAT_MODEL = 'tier-standard';
    const ctor = mockChatOpenAI();

    const { createLLM } = await import('../../config/llmProvider.js');
    await createLLM({ purpose: 'chat' });

    expect(ctor.mock.calls[0][0].model).toBe('tier-standard');
  });

  it('falls back to AZURE_OPENAI_* when LITELLM_* is unset (smooth cutover)', async () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    process.env.AZURE_OPENAI_ENDPOINT = 'http://litellm.ai.svc.cluster.local:4000';
    process.env.AZURE_OPENAI_API_KEY = 'sk-azure-vkey';
    process.env.LLM_MODEL = 'ollama-cloud';
    const ctor = mockChatOpenAI();

    const { createLLM } = await import('../../config/llmProvider.js');
    await createLLM({ purpose: 'analysis' });

    const args = ctor.mock.calls[0][0];
    expect(args.configuration.baseURL).toBe('http://litellm.ai.svc.cluster.local:4000/v1');
    expect(args.apiKey).toBe('sk-azure-vkey');
    expect(args.model).toBe('ollama-cloud');
  });

  it('throws a clear error when no model is configured', async () => {
    // LLM_MODEL intentionally unset
    mockChatOpenAI();
    const { createLLM } = await import('../../config/llmProvider.js');
    await expect(createLLM({ purpose: 'analysis' })).rejects.toThrow(/model is required/i);
  });

  it('throws a clear error when the gateway URL is unset', async () => {
    delete process.env.LITELLM_BASE_URL;
    process.env.LLM_MODEL = 'tier-premium';
    mockChatOpenAI();
    const { createLLM } = await import('../../config/llmProvider.js');
    await expect(createLLM({ purpose: 'analysis' })).rejects.toThrow(/gateway URL is required/i);
  });

  it('getActiveLLMMeta reports provider=litellm + the resolved model', async () => {
    process.env.LLM_MODEL = 'tier-premium';
    process.env.JUDGE_LLM_MODEL = 'tier-standard';

    const { getActiveLLMMeta } = await import('../../config/llmProvider.js');

    expect(getActiveLLMMeta('analysis')).toEqual({
      provider: 'litellm',
      model: 'tier-premium',
      purpose: 'analysis',
    });
    // judge model resolution happens in getJudgeLLM, not getActiveLLMMeta; meta uses LLM_MODEL here
    expect(getActiveLLMMeta('chat').provider).toBe('litellm');
  });

  it('getCurrentProvider is always the gateway', async () => {
    process.env.LLM_PROVIDER = 'azure_openai'; // legacy value — must be ignored
    const { getCurrentProvider } = await import('../../config/llmProvider.js');
    expect(getCurrentProvider()).toBe('litellm');
  });
});

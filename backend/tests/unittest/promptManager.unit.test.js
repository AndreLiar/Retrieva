/**
 * promptManager (RTV-14 — Langfuse Prompt Management).
 * Verifies Langfuse-first resolution, Git fallback (never a SPOF), Mustache compile,
 * and label routing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getLangfusePrompt } = vi.hoisted(() => ({ getLangfusePrompt: vi.fn() }));

vi.mock('../../config/tracing.js', () => ({ getLangfusePrompt }));
vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  getLangfusePrompt.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('resolveRagPrompt', () => {
  it('uses the Langfuse prompt (compiled) when available, and returns the object for linking', async () => {
    const lfPrompt = { compile: vi.fn(() => 'LF system with CTX and INSTR') };
    getLangfusePrompt.mockResolvedValue(lfPrompt);
    const { resolveRagPrompt } = await import('../../config/promptManager.js');

    const r = await resolveRagPrompt({ context: 'CTX', responseInstruction: 'INSTR' });
    expect(r.source).toBe('langfuse');
    expect(r.systemText).toContain('LF system');
    expect(r.langfusePrompt).toBe(lfPrompt); // returned for trace-linking
    expect(lfPrompt.compile).toHaveBeenCalledWith({ context: 'CTX', responseInstruction: 'INSTR' });
  });

  it('falls back to the Git template (Mustache-rendered) when Langfuse returns null', async () => {
    getLangfusePrompt.mockResolvedValue(null);
    const { resolveRagPrompt } = await import('../../config/promptManager.js');

    const r = await resolveRagPrompt({ context: 'MY_CONTEXT', responseInstruction: 'MY_INSTR' });
    expect(r.source).toBe('git');
    expect(r.langfusePrompt).toBeNull();
    expect(r.systemText).toContain('MY_CONTEXT'); // {{context}} substituted
    expect(r.systemText).toContain('MY_INSTR');
    expect(r.systemText).not.toContain('{{context}}'); // no unrendered vars leak
  });

  it('falls back to Git when the Langfuse prompt.compile throws', async () => {
    getLangfusePrompt.mockResolvedValue({ compile: () => { throw new Error('bad template'); } });
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'C', responseInstruction: '' });
    expect(r.source).toBe('git');
    expect(r.systemText).toContain('C');
  });

  it('routes by the LANGFUSE_PROMPT_LABEL env (dev=latest, prod=production)', async () => {
    vi.stubEnv('LANGFUSE_PROMPT_LABEL', 'production');
    getLangfusePrompt.mockResolvedValue(null);
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    await resolveRagPrompt({ context: 'c' });
    expect(getLangfusePrompt).toHaveBeenCalledWith('retrieva-rag-system', { label: 'production' });
  });

  it('never leaves a missing variable as an empty-brace artifact', async () => {
    getLangfusePrompt.mockResolvedValue(null);
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'c' }); // responseInstruction omitted
    expect(r.systemText).not.toMatch(/\{\{/);
  });
});

describe('resolveRagPrompt — guarded-dynamic model params', () => {
  it('returns clamped params from the Langfuse prompt config (temperature/top_p/maxTokens)', async () => {
    getLangfusePrompt.mockResolvedValue({
      compile: () => 'sys',
      config: { temperature: 0.7, top_p: 0.9, max_tokens: 1500 },
    });
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'c' });
    expect(r.modelParams.temperature).toBe(0.7);
    expect(r.modelParams.topP).toBe(0.9); // snake_case top_p accepted
    expect(r.modelParams.maxTokens).toBe(1500);
  });

  it('CLAMPS out-of-bounds params (a bad playground value cannot reach prod)', async () => {
    getLangfusePrompt.mockResolvedValue({
      compile: () => 'sys',
      config: { temperature: 9, topP: 5, maxTokens: 999999 },
    });
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'c' });
    expect(r.modelParams.temperature).toBe(2); // clamped to [0,2]
    expect(r.modelParams.topP).toBe(1); // clamped to [0,1]
    expect(r.modelParams.maxTokens).toBe(4096); // clamped to [1,4096]
  });

  it('IGNORES a model override in the prompt config (model stays env-routed)', async () => {
    getLangfusePrompt.mockResolvedValue({
      compile: () => 'sys',
      config: { model: 'gpt-4o', temperature: 0.2 },
    });
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'c' });
    expect(r.modelParams.model).toBeUndefined();
    expect(r.modelParams.temperature).toBe(0.2);
  });

  it('falls back to safe code-side default params when Langfuse is unavailable', async () => {
    getLangfusePrompt.mockResolvedValue(null);
    const { resolveRagPrompt } = await import('../../config/promptManager.js');
    const r = await resolveRagPrompt({ context: 'c' });
    expect(r.modelParams).toEqual({ temperature: 0.1, topP: 1, maxTokens: 2048 });
  });
});

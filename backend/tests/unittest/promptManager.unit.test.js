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

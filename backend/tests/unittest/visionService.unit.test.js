/**
 * visionService (RTV-14 Phase 2 — gated VLM figure captioning).
 * Verifies the cost gates: disabled by default, pre-filter, per-doc cap,
 * best-effort on failure, and that captions come only from surviving figures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isVlmCaptionEnabled', () => {
  it('is off by default (no flag)', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', '');
    const m = await import('../../services/visionService.js');
    expect(m.isVlmCaptionEnabled()).toBe(false);
  });

  it('is off when enabled but no gateway key', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', 'true');
    vi.stubEnv('AZURE_OPENAI_API_KEY', '');
    const m = await import('../../services/visionService.js');
    expect(m.isVlmCaptionEnabled()).toBe(false);
  });
});

describe('figurePassesFilter', () => {
  it('accepts a reasonable chart-sized figure', async () => {
    const { figurePassesFilter } = await import('../../services/visionService.js');
    expect(figurePassesFilter({ dataUrl: 'data:image/png;base64,x', width: 400, height: 300, bytes: 9000 })).toBe(true);
  });
  it('rejects tiny byte payloads (icons/logos)', async () => {
    const { figurePassesFilter } = await import('../../services/visionService.js');
    expect(figurePassesFilter({ dataUrl: 'd', width: 400, height: 300, bytes: 200 })).toBe(false);
  });
  it('rejects too-small bounding boxes', async () => {
    const { figurePassesFilter } = await import('../../services/visionService.js');
    expect(figurePassesFilter({ dataUrl: 'd', width: 40, height: 300, bytes: 9000 })).toBe(false);
  });
  it('rejects extreme aspect ratios (rules/banners)', async () => {
    const { figurePassesFilter } = await import('../../services/visionService.js');
    expect(figurePassesFilter({ dataUrl: 'd', width: 1000, height: 40, bytes: 9000 })).toBe(false);
  });
});

describe('captionFigures — gating', () => {
  it('returns [] when disabled (no VLM call)', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('../../services/visionService.js');
    const out = await m.captionFigures([{ dataUrl: 'data:image/png;base64,x', width: 400, height: 300, bytes: 9000 }]);
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns [] for a doc with no figures (no VLM call)', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', 'true');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'k');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('../../services/visionService.js');
    expect(await m.captionFigures([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('captions only filtered figures, respects the per-doc cap', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', 'true');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'k');
    vi.stubEnv('VLM_MAX_FIGURES', '2');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'A bar chart of incidents by severity.' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('../../services/visionService.js');
    const figs = [
      { dataUrl: 'data:image/png;base64,a', width: 400, height: 300, bytes: 9000 },
      { dataUrl: 'data:image/png;base64,b', width: 500, height: 300, bytes: 9000 },
      { dataUrl: 'data:image/png;base64,tiny', width: 20, height: 20, bytes: 200 }, // filtered out
    ];
    const caps = await m.captionFigures(figs, { fileName: 'report.pdf' });
    expect(caps.length).toBe(2); // cap=2; tiny dropped
    expect(caps[0]).toMatch(/### Figure 1/);
    expect(caps[0]).toContain('bar chart');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is best-effort: a failing figure is skipped, others still return', async () => {
    vi.stubEnv('INGEST_VLM_CAPTION', 'true');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'k');
    vi.stubEnv('VLM_CONCURRENCY', '1');
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 500, text: async () => 'boom' };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok caption' } }] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('../../services/visionService.js');
    const figs = [
      { dataUrl: 'data:image/png;base64,a', width: 500, height: 300, bytes: 9000 },
      { dataUrl: 'data:image/png;base64,b', width: 400, height: 300, bytes: 9000 },
    ];
    const caps = await m.captionFigures(figs, { fileName: 'r.pdf' });
    expect(caps.length).toBe(1); // one failed, one succeeded
    expect(caps[0]).toContain('ok caption');
  });
});

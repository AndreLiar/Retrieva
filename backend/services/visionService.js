/**
 * Vision captioning service (RTV-14 Phase 2 — Tier 3).
 *
 * Turns figures (charts/diagrams) extracted by Docling into short analytical text
 * captions via a governed VLM (LiteLLM → azure-gpt-4.1-mini), so their content
 * becomes searchable through the existing text embeddings. No new vector store.
 *
 * COST DISCIPLINE — the VLM is a gated ingestion-time enrichment, NEVER a
 * per-request/per-chat call. Every gate below must pass before one VLM call:
 *   1. INGEST_VLM_CAPTION must be enabled (opt-in; off by default).
 *   2. The document must actually contain figures (pure-text docs → 0 calls).
 *   3. Each figure must pass the pre-filter (min size / aspect / bytes) — skips
 *      logos, icons, rules, watermarks.
 *   4. Per-document cap (largest figures first) + bounded concurrency.
 * A 40-page text contract = 0 calls; a 3-chart deck = ~3 calls.
 */

import { resolveVisionCaptionPrompt } from '../config/promptManager.js';
import logger from '../config/logger.js';

const VLM_ENABLED = String(process.env.INGEST_VLM_CAPTION ?? 'false').toLowerCase() === 'true';
const VLM_MODEL = process.env.VLM_CAPTION_MODEL || 'azure-gpt-4.1-mini';
// Reuse the governed gateway the backend already talks to (LiteLLM, EU-scoped key).
const GW_BASE = process.env.AZURE_OPENAI_ENDPOINT || 'http://litellm.ai.svc.cluster.local:4000';
const GW_KEY = process.env.AZURE_OPENAI_API_KEY;

const MAX_FIGURES = Number(process.env.VLM_MAX_FIGURES || 10);
const CONCURRENCY = Number(process.env.VLM_CONCURRENCY || 3);
const MIN_PT = Number(process.env.VLM_MIN_FIGURE_PT || 80); // PDF points (~1.1in)
const MIN_BYTES = Number(process.env.VLM_MIN_FIGURE_BYTES || 3000); // tiny crops = decorative
const MIN_ASPECT = 0.2;
const MAX_ASPECT = 5.0;
const TIMEOUT_MS = Number(process.env.VLM_TIMEOUT_MS || 40000);

// Git seed + runtime fallback for the Langfuse-managed prompt `retrieva-vision-caption`.
export const VISION_CAPTION_PROMPT =
  'You are indexing a document figure for search. In 2–3 sentences, describe the ' +
  'figure type (bar/line/pie chart, diagram, table, photo…), its axes/labels, and ' +
  'the key data points or trend it conveys. Transcribe any embedded text. Be factual; ' +
  'do not speculate beyond what is shown.';

export function isVlmCaptionEnabled() {
  return VLM_ENABLED && !!GW_KEY;
}

/** A figure survives the pre-filter (so it's worth a VLM call). */
export function figurePassesFilter(fig) {
  if (!fig || typeof fig.dataUrl !== 'string') return false;
  if ((fig.bytes || fig.dataUrl.length) < MIN_BYTES) return false;
  const w = fig.width || 0;
  const h = fig.height || 0;
  // If Docling gave a bbox, enforce min size + aspect; if not (0), fall back to bytes only.
  if (w > 0 && h > 0) {
    if (w < MIN_PT || h < MIN_PT) return false;
    const aspect = w / h;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
  }
  return true;
}

async function captionOne(dataUrl, promptText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GW_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + GW_KEY, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: VLM_MODEL,
        max_tokens: 180,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`VLM HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    const json = await res.json();
    return (json?.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Caption the figures of one document. Returns an array of caption strings (one
 * per successfully-captioned figure, in figure order). Returns [] when disabled,
 * when there are no figures, or when none pass the filter.
 *
 * @param {Array<{dataUrl:string,width:number,height:number,bytes:number}>} figures
 * @param {object} [opts]
 * @param {string} [opts.fileName]
 * @param {object} [opts.trace] optional Langfuse trace handle — each figure is logged
 *   as a multimodal generation (image input) under it.
 */
export async function captionFigures(figures, { fileName, trace } = {}) {
  if (!isVlmCaptionEnabled()) return [];
  if (!Array.isArray(figures) || figures.length === 0) return [];

  const kept = figures
    .filter(figurePassesFilter)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))
    .slice(0, MAX_FIGURES);

  if (kept.length === 0) {
    logger.info('VLM captioning: no figures passed the pre-filter', {
      service: 'vision', fileName, total: figures.length,
    });
    return [];
  }

  // Resolve the caption prompt (Langfuse-managed, label-routed) with the Git PROMPT
  // as fallback. Resolved once per document; linked to each figure generation for
  // trace-linked prompt-version attribution.
  const vp = await resolveVisionCaptionPrompt(VISION_CAPTION_PROMPT);
  const promptText = vp.text;

  logger.info('VLM captioning figures', {
    service: 'vision', fileName, model: VLM_MODEL,
    total: figures.length, captioning: kept.length, promptSource: vp.source,
  });

  // Bounded-concurrency worker pool (never fan out unboundedly).
  const captions = new Array(kept.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < kept.length) {
      const i = next++;
      const fig = kept[i];
      // Multimodal generation (RTV-14 gap 3): log the figure image as the input so
      // visual inputs appear in the retrieva Langfuse project. The core SDK extracts
      // the base64 data-URI and stores it as media. No-op when no trace/disabled.
      const gen = trace?.generation?.({
        name: `figure-caption-${i + 1}`,
        model: VLM_MODEL,
        ...(vp.langfusePrompt ? { prompt: vp.langfusePrompt } : {}),
        input: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: fig.dataUrl } },
            ],
          },
        ],
        metadata: {
          fileName,
          width: Math.round(fig.width || 0),
          height: Math.round(fig.height || 0),
          bytes: fig.bytes,
        },
      });
      try {
        const caption = await captionOne(fig.dataUrl, promptText);
        captions[i] = caption;
        gen?.end?.({ output: caption });
      } catch (err) {
        logger.warn('VLM caption failed for a figure (skipping)', {
          service: 'vision', fileName, index: i, error: err.message,
        });
        captions[i] = null; // best-effort: one bad figure never fails ingestion
        gen?.end?.({ output: null, level: 'ERROR', statusMessage: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, kept.length) }, worker));

  return captions
    .map((c, i) => (c ? `### Figure ${i + 1}\n${c}` : null))
    .filter(Boolean);
}

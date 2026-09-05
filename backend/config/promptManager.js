/**
 * Prompt Manager (RTV-14 — Langfuse Prompt Management).
 *
 * Resolves managed prompts from the dedicated retrieva Langfuse project, with the
 * Git-committed template as a fallback so prompt management is never a runtime SPOF.
 *
 *   Langfuse (label-routed) → .compile(vars)  ── primary
 *   Git template           → mustache-lite    ── fallback (Langfuse off/down/absent)
 *
 * Label routing (one project, dev + prod): LANGFUSE_PROMPT_LABEL selects the version
 * — prod overlay = `production`, dev overlay = `latest`. Relabelling a version in the
 * Langfuse UI rolls a prompt out/back with zero redeploy.
 */

import { getLangfusePrompt } from './tracing.js';
import { RAG_SYSTEM_TEMPLATE, RAG_PROMPT_VARIABLES, RAG_PROMPT_CONFIG } from '../prompts/ragPrompt.js';
import logger from './logger.js';

const PROMPT_LABEL = process.env.LANGFUSE_PROMPT_LABEL || 'latest';
const RAG_PROMPT_NAME = 'retrieva-rag-system';

// Guardrail bounds for params read from the (externally-editable) Langfuse prompt
// config — a bad/unbounded playground value can never reach prod (DORA change-safety).
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function safeModelParams(cfg = {}) {
  const out = {};
  if (typeof cfg.temperature === 'number') out.temperature = clamp(cfg.temperature, 0, 2);
  if (typeof cfg.topP === 'number') out.topP = clamp(cfg.topP, 0, 1);
  if (typeof cfg.top_p === 'number') out.topP = clamp(cfg.top_p, 0, 1); // accept snake_case from UI
  if (typeof cfg.maxTokens === 'number') out.maxTokens = clamp(Math.round(cfg.maxTokens), 1, 4096);
  if (typeof cfg.max_tokens === 'number') out.maxTokens = clamp(Math.round(cfg.max_tokens), 1, 4096);
  // NOTE: `model` in the prompt config is intentionally IGNORED — the model stays
  // env-routed (LLM_MODEL / intent alias) so a prompt edit can't bypass EU/governance.
  return out;
}

/** Minimal, dependency-free Mustache substitution for the Git fallback path. */
function renderMustacheLite(template, vars = {}) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    key in vars && vars[key] !== null && vars[key] !== undefined ? String(vars[key]) : ''
  );
}

/**
 * Resolve the RAG system prompt for one request.
 *
 * @param {object} vars  values for the template variables (context, responseInstruction)
 * @returns {Promise<{ systemText: string, langfusePrompt: object|null, source: 'langfuse'|'git', label: string, modelParams: object }>}
 */
export async function resolveRagPrompt(vars = {}) {
  const safeVars = {};
  for (const v of RAG_PROMPT_VARIABLES) safeVars[v] = vars[v] ?? '';

  const lf = await getLangfusePrompt(RAG_PROMPT_NAME, { label: PROMPT_LABEL });
  if (lf) {
    try {
      const systemText = lf.compile(safeVars);
      // Guarded-dynamic model params: start from the Git defaults, overlay the
      // Langfuse prompt config, then clamp to safe bounds (drop `model`).
      const modelParams = { ...RAG_PROMPT_CONFIG, ...safeModelParams(lf.config || {}) };
      return { systemText, langfusePrompt: lf, source: 'langfuse', label: PROMPT_LABEL, modelParams };
    } catch (e) {
      logger.warn('Langfuse prompt.compile failed — using Git fallback', {
        service: 'prompt-manager', name: RAG_PROMPT_NAME, error: e.message,
      });
    }
  }
  return {
    systemText: renderMustacheLite(RAG_SYSTEM_TEMPLATE, safeVars),
    langfusePrompt: null,
    source: 'git',
    label: PROMPT_LABEL,
    modelParams: { ...RAG_PROMPT_CONFIG }, // safe code-side defaults
  };
}

export const __testables = { renderMustacheLite, safeModelParams, PROMPT_LABEL, RAG_PROMPT_NAME };

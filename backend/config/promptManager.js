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
import {
  CONTRACT_A30_SYSTEM_PROMPT,
  DORA_SYSTEM_PROMPT,
} from '../prompts/gapAnalysisPrompts.js';
import logger from './logger.js';

const PROMPT_LABEL = process.env.LANGFUSE_PROMPT_LABEL || 'latest';
const RAG_PROMPT_NAME = 'retrieva-rag-system';
// Langfuse prompt names for the other managed prompts (static — no template vars).
export const PROMPT_NAMES = {
  rag: RAG_PROMPT_NAME,
  contractA30: 'retrieva-contract-a30-system',
  doraGap: 'retrieva-dora-gap-system',
  visionCaption: 'retrieva-vision-caption',
};

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
 * Generic resolver: Langfuse-first (label-routed) with a Git-committed fallback.
 * Works for both templated prompts (pass `vars`) and static prompts (`vars={}`).
 *
 * @param {object}  o
 * @param {string}  o.name             Langfuse prompt name
 * @param {string}  o.fallbackTemplate Git-committed text (seed + runtime fallback)
 * @param {object}  [o.vars]           Mustache variables (empty for static prompts)
 * @param {object}  [o.fallbackConfig] default model params (null = don't manage params)
 * @returns {Promise<{ text: string, langfusePrompt: object|null, source: 'langfuse'|'git', label: string, modelParams: object }>}
 */
export async function resolveManagedPrompt({ name, fallbackTemplate, vars = {}, fallbackConfig = null }) {
  const lf = await getLangfusePrompt(name, { label: PROMPT_LABEL });
  if (lf) {
    try {
      const text = lf.compile(vars); // static prompts: vars={} → returns text unchanged
      const modelParams = fallbackConfig
        ? { ...fallbackConfig, ...safeModelParams(lf.config || {}) }
        : safeModelParams(lf.config || {});
      return { text, langfusePrompt: lf, source: 'langfuse', label: PROMPT_LABEL, modelParams };
    } catch (e) {
      logger.warn('Langfuse prompt.compile failed — using Git fallback', {
        service: 'prompt-manager', name, error: e.message,
      });
    }
  }
  return {
    text: renderMustacheLite(fallbackTemplate, vars),
    langfusePrompt: null,
    source: 'git',
    label: PROMPT_LABEL,
    modelParams: fallbackConfig ? { ...fallbackConfig } : {},
  };
}

/**
 * Resolve the RAG system prompt for one request. Keeps `systemText` (RAG callers use it).
 *
 * @param {object} vars  values for the template variables (context, responseInstruction)
 */
export async function resolveRagPrompt(vars = {}) {
  const safeVars = {};
  for (const v of RAG_PROMPT_VARIABLES) safeVars[v] = vars[v] ?? '';
  const r = await resolveManagedPrompt({
    name: RAG_PROMPT_NAME,
    fallbackTemplate: RAG_SYSTEM_TEMPLATE,
    vars: safeVars,
    fallbackConfig: RAG_PROMPT_CONFIG,
  });
  return { systemText: r.text, ...r };
}

/** Contract Art.30 review agent system prompt (static). */
export function resolveContractA30Prompt() {
  return resolveManagedPrompt({
    name: PROMPT_NAMES.contractA30,
    fallbackTemplate: CONTRACT_A30_SYSTEM_PROMPT,
  });
}

/** DORA gap-analysis agent system prompt (static). */
export function resolveDoraPrompt() {
  return resolveManagedPrompt({
    name: PROMPT_NAMES.doraGap,
    fallbackTemplate: DORA_SYSTEM_PROMPT,
  });
}

/** Vision figure-caption prompt (static). Fallback text passed by the caller. */
export function resolveVisionCaptionPrompt(fallbackTemplate) {
  return resolveManagedPrompt({ name: PROMPT_NAMES.visionCaption, fallbackTemplate });
}

export const __testables = { renderMustacheLite, safeModelParams, PROMPT_LABEL, RAG_PROMPT_NAME };

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
import { RAG_SYSTEM_TEMPLATE, RAG_PROMPT_VARIABLES } from '../prompts/ragPrompt.js';
import logger from './logger.js';

const PROMPT_LABEL = process.env.LANGFUSE_PROMPT_LABEL || 'latest';
const RAG_PROMPT_NAME = 'retrieva-rag-system';

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
 * @returns {Promise<{ systemText: string, langfusePrompt: object|null, source: 'langfuse'|'git', label: string }>}
 */
export async function resolveRagPrompt(vars = {}) {
  const safeVars = {};
  for (const v of RAG_PROMPT_VARIABLES) safeVars[v] = vars[v] ?? '';

  const lf = await getLangfusePrompt(RAG_PROMPT_NAME, { label: PROMPT_LABEL });
  if (lf) {
    try {
      const systemText = lf.compile(safeVars);
      return { systemText, langfusePrompt: lf, source: 'langfuse', label: PROMPT_LABEL };
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
  };
}

export const __testables = { renderMustacheLite, PROMPT_LABEL, RAG_PROMPT_NAME };

// Tracing / LLMOps observability.
//
// Two backends, both optional and disabled unless configured:
//   • LangSmith  — LangChain-native callbacks (LangChainTracer), passed to chain .invoke().
//   • Langfuse   — the platform LLMOps backbone. App-level RAG traces (Trace → retrieval/rerank
//                  spans → generation) with session_id/user_id, sent to the per-product Langfuse
//                  project. Uses the Langfuse CORE SDK (not langfuse-langchain, whose peer dep is
//                  langchain <0.4 — incompatible with this app's LangChain v1). We build the trace
//                  hierarchy manually, which is richer and version-safe.
//
// Both are no-ops when their env vars are absent, so this module is safe to import everywhere and
// the RAG code never needs null checks (startTrace returns a null-object handle when disabled).
import { Client } from 'langsmith';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Langfuse } from 'langfuse';
import logger from './logger.js';

// ── LangSmith (unchanged) ────────────────────────────────────────────────────
const {
  LANGSMITH_API_KEY,
  LANGSMITH_PROJECT = 'retrieva',
  LANGSMITH_ENABLED = 'false',
  LANGSMITH_TRACE_LEVEL = 'metadata',
  LANGSMITH_API_URL,
} = process.env;

const langsmithEnabled = LANGSMITH_ENABLED === 'true' && !!LANGSMITH_API_KEY;
const langsmithClient = langsmithEnabled
  ? new Client({ apiKey: LANGSMITH_API_KEY, ...(LANGSMITH_API_URL ? { apiUrl: LANGSMITH_API_URL } : {}) })
  : null;

export function isLangSmithEnabled() {
  return langsmithEnabled;
}

// ── Langfuse (app-level RAG tracing) ─────────────────────────────────────────
const LF_PUBLIC = process.env.LANGFUSE_PUBLIC_KEY;
const LF_SECRET = process.env.LANGFUSE_SECRET_KEY;
const LF_BASEURL =
  process.env.LANGFUSE_BASEURL || process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST;
const langfuseEnabled = !!(LF_PUBLIC && LF_SECRET);

const langfuse = langfuseEnabled
  ? new Langfuse({ publicKey: LF_PUBLIC, secretKey: LF_SECRET, ...(LF_BASEURL ? { baseUrl: LF_BASEURL } : {}) })
  : null;

if (langfuseEnabled) {
  logger.info('Langfuse tracing enabled', { baseUrl: LF_BASEURL || 'cloud' });
}

export function isLangfuseEnabled() {
  return langfuseEnabled;
}

// Null-object so callers write trace.span(...) / gen.end(...) unconditionally.
const NULL_OBS = { end() {}, update() {} };
const NULL_TRACE = { id: null, span: () => NULL_OBS, generation: () => NULL_OBS, update() {}, async flush() {} };

/**
 * Start an app-level trace for one request (e.g. a RAG query). Returns a null-safe handle:
 *   const t = startTrace({ name, sessionId, userId, input, tags, metadata });
 *   const s = t.span({ name:'retrieval', input }); ...; s.end({ output });
 *   const g = t.generation({ name:'answer', model, input }); ...; g.end({ output, usage });
 *   t.update({ output }); await t.flush();
 * When Langfuse is disabled every call is a no-op.
 */
export function startTrace({ name, sessionId, userId, input, tags, metadata } = {}) {
  if (!langfuse) return NULL_TRACE;
  try {
    const trace = langfuse.trace({
      name,
      sessionId: sessionId || undefined,
      userId: userId || undefined,
      input,
      tags,
      metadata,
    });
    return {
      id: trace.id,
      span: (opts) => trace.span(opts),
      generation: (opts) => trace.generation(opts),
      update: (u) => trace.update(u),
      flush: async () => {
        try {
          await langfuse.flushAsync();
        } catch (e) {
          logger.warn('Langfuse flush failed', { error: e.message });
        }
      },
    };
  } catch (e) {
    logger.warn('Langfuse startTrace failed', { error: e.message });
    return NULL_TRACE;
  }
}

/**
 * LangChain callbacks for chain .invoke() — LangSmith only (Langfuse traces are built manually via
 * startTrace, since langfuse-langchain does not support LangChain v1).
 */
export function getCallbacks(options = {}) {
  if (!langsmithEnabled) return [];
  const { runName, userId, workspaceId, sessionId, feature = 'unknown' } = options;
  const tracer = new LangChainTracer({
    client: langsmithClient,
    projectName: LANGSMITH_PROJECT,
    ...(runName ? { runName } : {}),
    tags: [`feature:${feature}`, `env:${process.env.NODE_ENV || 'development'}`],
    metadata: {
      ...(userId ? { userId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(sessionId ? { sessionId } : {}),
      traceLevel: LANGSMITH_TRACE_LEVEL,
    },
  });
  return [tracer];
}

/**
 * Map a user rating (👍/👎 or 0–1) back to its trace. Works for both backends.
 */
export async function logFeedback(traceId, score, comment) {
  if (!traceId) return;
  if (langfuse) {
    try {
      langfuse.score({ traceId, name: 'user_rating', value: score, comment: comment || undefined });
    } catch (e) {
      logger.warn('Langfuse score failed', { error: e.message });
    }
  }
  if (langsmithEnabled) {
    try {
      await langsmithClient.createFeedback(traceId, 'user_rating', { score, comment: comment || undefined });
    } catch (e) {
      logger.warn('LangSmith feedback failed', { error: e.message });
    }
  }
}

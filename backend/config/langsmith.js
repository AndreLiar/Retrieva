import { Client } from 'langsmith';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import logger from './logger.js';

const {
  LANGSMITH_API_KEY,
  LANGSMITH_PROJECT = 'rag-notion',
  LANGSMITH_ENABLED = 'false',
  LANGSMITH_TRACE_LEVEL = 'metadata', // 'full' | 'metadata'
  LANGSMITH_API_URL,
} = process.env;

const enabled = LANGSMITH_ENABLED === 'true' && !!LANGSMITH_API_KEY;

const client = enabled
  ? new Client({
      apiKey: LANGSMITH_API_KEY,
      ...(LANGSMITH_API_URL ? { apiUrl: LANGSMITH_API_URL } : {}),
    })
  : null;

if (enabled) {
  logger.info('LangSmith tracing enabled', {
    project: LANGSMITH_PROJECT,
    traceLevel: LANGSMITH_TRACE_LEVEL,
  });
}

export function isLangSmithEnabled() {
  return enabled;
}

export function getCallbacks(options = {}) {
  if (!enabled) return [];
  const { runName, userId, workspaceId, sessionId, feature = 'unknown' } = options;
  const tracer = new LangChainTracer({
    client,
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

export async function logFeedback(runId, score, comment) {
  if (!enabled || !runId) return;
  try {
    await client.createFeedback(runId, 'user_rating', { score, comment: comment || undefined });
    logger.info('LangSmith feedback logged', { runId, score });
  } catch (err) {
    logger.warn('Failed to log LangSmith feedback', { runId, error: err.message });
  }
}

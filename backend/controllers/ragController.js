import { executeRAG, InputGuardrailError } from '../services/ragExecutor.js';
import { queryRouter } from '../services/intent/index.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';

/**
 * POST /api/v1/rag — JSON transport
 *
 * All RAG logic (guardrails, intent routing, retrieval, reranking,
 * compression, memory, sanitization, caching, hallucination blocking,
 * activity logging, token tracking) lives in executeRAG().
 * This controller only handles HTTP request/response shaping.
 */
export const askQuestion = catchAsync(async (req, res) => {
  const { question, conversationId, filters, useIntentAware = true, forceIntent } = req.body;

  if (!conversationId) {
    return sendError(res, 400, 'conversationId is required');
  }

  try {
    const result = await executeRAG({
      question,
      conversationId,
      filters: filters || null,
      userId: req.user?.userId?.toString(),
      forceIntent: forceIntent || null,
      useIntentAware,
    });

    sendSuccess(res, 200, 'Question answered successfully', result);
  } catch (error) {
    if (error instanceof InputGuardrailError) {
      return sendError(res, 400, error.message);
    }
    throw error;
  }
});

/**
 * GET /api/v1/rag/stats — admin only
 *
 * Returns high-level routing metrics. Internal details (strategy
 * distribution, recent intents, Redis status) are sanitized out.
 */
export const getRoutingStats = catchAsync(async (_req, res) => {
  const rawStats = await queryRouter.getStats();

  const sanitizedStats = {
    totalRouted: rawStats.totalRouted || 0,
    intentDistribution: rawStats.intentDistribution || {},
    avgConfidence: rawStats.avgConfidence || '0',
    healthy: rawStats.redisConnected !== false && !rawStats.error,
  };

  sendSuccess(res, 200, 'Routing statistics retrieved', sanitizedStats);
});

import { executeRAG, InputGuardrailError } from '../services/ragExecutor.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

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
 * POST /api/v1/rag/stream — SSE transport
 *
 * Streams RAG events as Server-Sent Events. Same business logic as askQuestion
 * (delegates to executeRAG with an onEvent callback) but pipes each event to
 * the client as `event: <type>\ndata: <json>\n\n` so the UI can render tokens
 * progressively.
 */
export const askQuestionStream = catchAsync(async (req, res) => {
  const { question, conversationId, filters, useIntentAware = true, forceIntent } = req.body;

  if (!conversationId) {
    return sendError(res, 400, 'conversationId is required');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const send = (event, data) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  req.on('close', () => {
    closed = true;
  });

  try {
    await executeRAG({
      question,
      conversationId,
      filters: filters || null,
      userId: req.user?.userId?.toString(),
      forceIntent: forceIntent || null,
      useIntentAware,
      onEvent: send,
    });
  } catch (error) {
    if (error instanceof InputGuardrailError) {
      send('error', { message: error.message, code: 'INPUT_GUARDRAIL' });
    } else {
      logger.error('RAG stream failed', { error: error.message, stack: error.stack });
      send('error', { message: 'Stream failed', code: 'STREAM_ERROR' });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

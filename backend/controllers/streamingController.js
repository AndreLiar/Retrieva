import { executeRAG, InputGuardrailError } from '../services/ragExecutor.js';
import logger from '../config/logger.js';
import { randomUUID } from 'crypto';
// ISSUE #36 FIX: Import sendError for consistent error response format
import { sendError } from '../utils/index.js';

import {
  emitQueryStart,
  emitQueryStream,
  emitQuerySources,
  emitQueryComplete,
  emitQueryError,
} from '../services/realtimeEvents.js';

/**
 * POST /api/v1/rag/stream — SSE transport
 *
 * All RAG logic (guardrails, intent routing, retrieval, reranking,
 * compression, memory, sanitization, caching, hallucination blocking,
 * activity logging, token tracking) lives in executeRAG().
 * This controller only handles SSE framing and WebSocket mirroring.
 *
 * ISSUE #9 FIX: Handles client disconnect by aborting the RAG operation
 */
export const streamRAGResponse = async (req, res) => {
  const { question, conversationId } = req.body;
  const userId = req.user?.userId?.toString();
  const queryId = randomUUID();

  // ISSUE #36 FIX: Use sendError for consistent error format across controllers
  if (!question) {
    return sendError(res, 400, 'Question is required');
  }
  if (!conversationId) {
    return sendError(res, 400, 'conversationId is required');
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // ISSUE #9 FIX: Create AbortController for cancellation on client disconnect
  const abortController = new AbortController();
  let clientDisconnected = false;

  // Handle client disconnect - abort the RAG operation to save resources
  res.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
      logger.info('Client disconnected, aborting RAG stream', {
        service: 'rag-streaming',
        queryId,
        userId,
      });
    }
  });

  const sendEvent = (event, data) => {
    // Don't send events if client disconnected
    if (clientDisconnected || res.writableEnded) {
      return;
    }
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    } catch (_err) {
      // Client likely disconnected mid-write
      clientDisconnected = true;
      abortController.abort();
    }
  };

  try {
    if (userId) emitQueryStart(queryId, userId, { question });

    await executeRAG({
      question,
      conversationId,
      userId,
      signal: abortController.signal, // Pass abort signal to RAG executor
      onEvent: (type, data) => {
        // Skip events if client disconnected
        if (clientDisconnected) return;

        sendEvent(type, data);

        // Mirror key events to WebSocket
        if (!userId) return;
        if (type === 'chunk') emitQueryStream(queryId, userId, data.text, false);
        if (type === 'sources') emitQuerySources(queryId, userId, data.sources);
        if (type === 'done') {
          emitQueryStream(queryId, userId, '', true);
          emitQueryComplete(queryId, userId, { answer: '', sources: [], queryId });
        }
      },
    });

    if (!clientDisconnected) {
      res.end();
    }
  } catch (error) {
    // Handle abort (client disconnect) gracefully
    if (error.name === 'AbortError' || clientDisconnected) {
      logger.debug('RAG stream aborted due to client disconnect', {
        service: 'rag-streaming',
        queryId,
      });
      return; // Response already closed
    }

    if (error instanceof InputGuardrailError) {
      sendEvent('error', { message: error.message, guardrail: true });
      if (!clientDisconnected) res.end();
      return;
    }

    logger.error('Streaming error', { service: 'rag-streaming', queryId, error: error.message });
    if (userId) emitQueryError(queryId, userId, error);
    sendEvent('error', { message: error.message || 'An error occurred during streaming' });
    if (!clientDisconnected) res.end();
  }
};

/**
 * Shared RAG Execution Flow
 *
 * Single entry point for all RAG queries.
 * Controllers call executeRAG() and handle transport only.
 */

import { ragService } from './rag.js';
import logger from '../config/logger.js';
import { AppError } from '../utils/index.js';

export class InputGuardrailError extends AppError {
  constructor() {
    super('Your question could not be processed. Please rephrase and try again.', 400);
    this.name = 'InputGuardrailError';
  }
}

/**
 * Execute a RAG query.
 *
 * @param {Object} params
 * @param {string} params.question         User's question
 * @param {string} params.conversationId   Conversation ID
 * @param {Object} [params.filters]        Retrieval filters
 * @param {Function} [params.onEvent]      SSE callback: (type, data) => void
 * @returns {Object} RAG result
 */
export async function executeRAG({ question, conversationId, filters = null, onEvent = null }) {
  logger.info('Executing RAG query', {
    service: 'rag-executor',
    questionLength: question.length,
    conversationId,
    streaming: !!onEvent,
  });

  const result = await ragService.askWithConversation(question, {
    conversationId,
    filters,
    onEvent,
  });

  logger.info('RAG query completed', {
    service: 'rag-executor',
    sourcesCount: result.sources?.length || 0,
    confidence: result.validation?.confidence,
  });

  return result;
}

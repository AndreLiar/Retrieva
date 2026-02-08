/**
 * Shared RAG Execution Flow
 *
 * Single entry point for all RAG queries. Owns every cross-cutting concern
 * that must never diverge between transports (JSON / SSE):
 *   input guardrails → pipeline → output guardrails → observability
 *
 * Controllers call executeRAG() and handle transport only.
 *
 * @module services/ragExecutor
 */

import { ragService } from './rag.js';
import { intentAwareRAG } from './intentAwareRAG.js';
import { classifyInput, classifyOutput, sanitizeOutput } from './llmGuardrailService.js';
import { Conversation } from '../models/Conversation.js';
import { TokenUsage } from '../models/TokenUsage.js';
import { activityFeedService } from './activityFeedService.js';
import { liveAnalyticsService } from './liveAnalyticsService.js';
import logger from '../config/logger.js';
import { AppError } from '../utils/index.js';

/**
 * Thrown when the input guardrail blocks a query.
 * Extends AppError so the global error handler returns 400 automatically.
 * Streaming controllers catch this explicitly to send an SSE error event.
 */
export class InputGuardrailError extends AppError {
  constructor(classification) {
    super('Your question could not be processed. Please rephrase and try again.', 400);
    this.name = 'InputGuardrailError';
    this.classification = classification;
  }
}

/**
 * Execute a RAG query with full guardrails, intent routing, and observability.
 *
 * @param {Object} params
 * @param {string} params.question          User's question
 * @param {string} params.conversationId    Conversation ID
 * @param {Object} [params.filters]         Retrieval filters
 * @param {string} [params.userId]          Authenticated user ID
 * @param {string} [params.forceIntent]     Force a specific intent (testing)
 * @param {boolean} [params.useIntentAware] Use intent-aware routing (default true)
 * @param {Function} [params.onEvent]       SSE callback: (type, data) => void
 * @returns {Object} RAG result with answer, sources, validation, usage
 */
export async function executeRAG({
  question,
  conversationId,
  filters = null,
  userId = null,
  forceIntent = null,
  useIntentAware = true,
  onEvent = null,
}) {
  // ── 1. Input guardrail (prompt injection detection) ──
  const inputClassification = await classifyInput(question, {
    useLlm: process.env.GUARDRAIL_USE_LLM === 'true',
    strict: process.env.GUARDRAIL_STRICT_MODE === 'true',
  });

  if (!inputClassification.allowed) {
    logger.warn('Question blocked by input guardrail', {
      service: 'rag-executor',
      classification: inputClassification.classification,
      reason: inputClassification.reason,
      score: inputClassification.patternScore,
      conversationId,
    });
    throw new InputGuardrailError(inputClassification);
  }

  if (inputClassification.classification === 'suspicious') {
    logger.info('Suspicious input allowed with caution', {
      service: 'rag-executor',
      score: inputClassification.patternScore,
      conversationId,
    });
  }

  logger.info('Executing RAG query', {
    service: 'rag-executor',
    questionLength: question.length,
    conversationId,
    intentAware: useIntentAware,
    streaming: !!onEvent,
    inputClassification: inputClassification.classification,
  });

  // ── 2. RAG pipeline ──
  let result;

  if (useIntentAware) {
    await intentAwareRAG.init();
    result = await intentAwareRAG.ask(question, {
      conversationId,
      filters,
      forceIntent,
      userId,
      onEvent,
    });
  } else {
    result = await ragService.askWithConversation(question, {
      conversationId,
      filters,
      onEvent,
    });
  }

  // ── 3. Output guardrail (sensitive content detection) ──
  const outputClassification = await classifyOutput(result.answer, {
    useLlm: process.env.GUARDRAIL_USE_LLM === 'true',
    strict: process.env.GUARDRAIL_STRICT_MODE === 'true',
  });

  if (!outputClassification.allowed) {
    logger.warn('Response filtered by output guardrail', {
      service: 'rag-executor',
      classification: outputClassification.classification,
      reason: outputClassification.reason,
      conversationId,
    });
    const sanitized = outputClassification.sanitizedOutput || sanitizeOutput(result.answer);
    result.answer = sanitized;
    result._outputFiltered = true;

    // For streaming: tell the client to replace the streamed answer
    if (onEvent) {
      onEvent('replace', { text: sanitized, reason: 'output_guardrail' });
    }
  }

  logger.info('RAG query completed', {
    service: 'rag-executor',
    sourcesCount: result.sources?.length || 0,
    confidence: result.validation?.confidence,
    intent: result.intent?.type || 'N/A',
    outputFiltered: result._outputFiltered || false,
  });

  // ── 4. Observability (non-blocking) ──
  liveAnalyticsService.recordQuery({
    responseTimeMs: result.processingTime,
    sourcesCount: result.sources?.length || 0,
    confidence: result.validation?.confidence,
  });

  await _trackUsage({ question, conversationId, userId, result });

  return result;
}

/**
 * Activity feed logging + token usage tracking.
 * Failures are swallowed — observability never blocks the response.
 */
async function _trackUsage({ question, conversationId, userId, result }) {
  try {
    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation?.workspaceId || conversation.workspaceId === 'default') return;

    const workspaceId = conversation.workspaceId;
    const effectiveUserId = userId || conversation.userId;

    // Activity feed (fire-and-forget)
    activityFeedService
      .logQueryActivity({
        workspaceId,
        userId: effectiveUserId,
        question,
        conversationId,
        metrics: {
          responseTimeMs: result.processingTime,
          sourcesCount: result.sources?.length || 0,
          confidence: result.validation?.confidence,
          tokensUsed: result.tokensUsed,
        },
      })
      .catch((err) => logger.warn('Failed to log query activity', { error: err.message }));

    // Token tracking
    if (userId && result.tokensUsed) {
      const usageResult = await TokenUsage.recordUsage(
        userId,
        result.tokensUsed.input || 0,
        result.tokensUsed.output || 0,
        workspaceId
      );

      if (usageResult.alertTriggered) {
        logger.warn('User approaching token limit', {
          service: 'rag-executor',
          userId,
          dailyUsage: usageResult.dailyUsage,
          dailyLimit: usageResult.dailyLimit,
          percentUsed: usageResult.percentUsed.toFixed(1),
        });
      }

      result.usage = {
        tokensUsed: result.tokensUsed,
        dailyUsage: usageResult.dailyUsage,
        dailyLimit: usageResult.dailyLimit,
        percentUsed: parseFloat(usageResult.percentUsed.toFixed(1)),
        estimatedCost: usageResult.estimatedCost,
      };
    }
  } catch (error) {
    logger.warn('Usage tracking failed', { service: 'rag-executor', error: error.message });
  }
}

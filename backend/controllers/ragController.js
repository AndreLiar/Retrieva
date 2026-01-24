import { ragService } from '../services/rag.js';
import { intentAwareRAG } from '../services/intentAwareRAG.js';
import { queryRouter } from '../services/intent/index.js';
import { Conversation } from '../models/Conversation.js';
import { TokenUsage } from '../models/TokenUsage.js';
import { activityFeedService } from '../services/activityFeedService.js';
import { liveAnalyticsService } from '../services/liveAnalyticsService.js';
import { classifyInput, classifyOutput, sanitizeOutput } from '../services/llmGuardrailService.js';
import logger from '../config/logger.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';

/**
 * Ask a question - RAG endpoint with Zod validation
 * POST /api/v1/rag
 *
 * REQUIRES conversationId - all queries are persisted to database.
 * Chat history is automatically loaded from the conversation.
 *
 * Options:
 * - useIntentAware: boolean (default: true) - Use intent-aware routing
 * - forceIntent: string - Force a specific intent (for testing)
 *
 * Note: Validation is handled by validateBody middleware
 */
export const askQuestion = catchAsync(async (req, res) => {
  const { question, conversationId, filters, useIntentAware = true, forceIntent } = req.body;

  // Validate required conversationId
  if (!conversationId) {
    return sendError(res, 400, 'conversationId is required');
  }

  // SECURITY FIX (LLM01): Input guardrail - detect prompt injection attempts
  const inputClassification = await classifyInput(question, {
    useLlm: process.env.GUARDRAIL_USE_LLM === 'true',
    strict: process.env.GUARDRAIL_STRICT_MODE === 'true',
  });

  if (!inputClassification.allowed) {
    logger.warn('Question blocked by input guardrail', {
      classification: inputClassification.classification,
      reason: inputClassification.reason,
      score: inputClassification.patternScore,
      conversationId,
    });
    return sendError(
      res,
      400,
      'Your question could not be processed. Please rephrase and try again.'
    );
  }

  // Log if suspicious but allowed
  if (inputClassification.classification === 'suspicious') {
    logger.info('Suspicious input allowed with caution', {
      score: inputClassification.patternScore,
      conversationId,
    });
  }

  logger.info('Processing RAG question', {
    questionLength: question.length,
    conversationId,
    intentAware: useIntentAware,
    inputClassification: inputClassification.classification,
  });

  let result;

  if (useIntentAware) {
    // Use intent-aware processing
    await intentAwareRAG.init();
    result = await intentAwareRAG.ask(question, {
      conversationId,
      filters: filters || null,
      forceIntent: forceIntent || null,
    });
  } else {
    // Use traditional RAG processing
    result = await ragService.askWithConversation(question, {
      conversationId,
      filters: filters || null,
    });
  }

  // SECURITY FIX (LLM01): Output guardrail - detect sensitive content leakage
  const outputClassification = await classifyOutput(result.answer, {
    useLlm: process.env.GUARDRAIL_USE_LLM === 'true',
    strict: process.env.GUARDRAIL_STRICT_MODE === 'true',
  });

  if (!outputClassification.allowed) {
    logger.warn('Response filtered by output guardrail', {
      classification: outputClassification.classification,
      reason: outputClassification.reason,
      conversationId,
    });
    // Sanitize the response instead of blocking completely
    result.answer = outputClassification.sanitizedOutput || sanitizeOutput(result.answer);
    result._outputFiltered = true;
  }

  logger.info('RAG question answered successfully', {
    sourcesCount: result.sources?.length || 0,
    confidence: result.validation?.confidence,
    intent: result.intent?.type || 'N/A',
    outputFiltered: result._outputFiltered || false,
  });

  // Record query for live analytics dashboard (non-blocking)
  liveAnalyticsService.recordQuery({
    responseTimeMs: result.processingTime,
    sourcesCount: result.sources?.length || 0,
    confidence: result.validation?.confidence,
  });

  // Log query activity for the activity feed (non-blocking)
  let workspaceId = null;
  try {
    const conversation = await Conversation.findById(conversationId).lean();
    if (conversation?.workspaceId && conversation.workspaceId !== 'default') {
      workspaceId = conversation.workspaceId;
      const userId = req.user?.userId || conversation.userId;
      activityFeedService
        .logQueryActivity({
          workspaceId: conversation.workspaceId,
          userId,
          question,
          conversationId,
          metrics: {
            responseTimeMs: result.processingTime,
            sourcesCount: result.sources?.length || 0,
            confidence: result.validation?.confidence,
            tokensUsed: result.tokensUsed,
          },
          isAnonymous: req.body.anonymousActivity || false,
        })
        .catch((err) => logger.warn('Failed to log query activity', { error: err.message }));
    }
  } catch (activityError) {
    // Don't fail the request if activity logging fails
    logger.warn('Failed to log query activity', { error: activityError.message });
  }

  // SECURITY FIX (API6:2023): Track LLM token costs per user/workspace
  // Records usage for cost attribution, quotas, and billing
  if (req.user?.userId && result.tokensUsed) {
    try {
      const usageResult = await TokenUsage.recordUsage(
        req.user.userId,
        result.tokensUsed.input || 0,
        result.tokensUsed.output || 0,
        workspaceId
      );

      // Log if user is approaching their limit
      if (usageResult.alertTriggered) {
        logger.warn('User approaching token limit', {
          userId: req.user.userId,
          dailyUsage: usageResult.dailyUsage,
          dailyLimit: usageResult.dailyLimit,
          percentUsed: usageResult.percentUsed.toFixed(1),
        });
      }

      // Include usage info in response for transparency
      result.usage = {
        tokensUsed: result.tokensUsed,
        dailyUsage: usageResult.dailyUsage,
        dailyLimit: usageResult.dailyLimit,
        percentUsed: parseFloat(usageResult.percentUsed.toFixed(1)),
        estimatedCost: usageResult.estimatedCost,
      };
    } catch (usageError) {
      // Don't fail the request if usage tracking fails
      logger.warn('Failed to record token usage', { error: usageError.message });
    }
  }

  sendSuccess(res, 200, 'Question answered successfully', result);
});

/**
 * Get intent routing statistics
 * GET /api/v1/rag/stats
 *
 * SECURITY FIX (API9:2023): Sanitize response to avoid exposing internal
 * routing logic, infrastructure details, or user query patterns.
 * Only high-level operational metrics are returned.
 */
export const getRoutingStats = catchAsync(async (_req, res) => {
  const rawStats = await queryRouter.getStats();

  // Sanitize response - only expose high-level operational metrics
  // Excludes: strategyDistribution (internal architecture), recentIntents (user patterns),
  // redisConnected (infrastructure details), error messages (potential info leak)
  const sanitizedStats = {
    totalRouted: rawStats.totalRouted || 0,
    intentDistribution: rawStats.intentDistribution || {},
    avgConfidence: rawStats.avgConfidence || '0',
    healthy: rawStats.redisConnected !== false && !rawStats.error,
  };

  sendSuccess(res, 200, 'Routing statistics retrieved', sanitizedStats);
});

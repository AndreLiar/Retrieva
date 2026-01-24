/**
 * Evaluation Controller
 *
 * Provides endpoints for RAG quality evaluation using RAGAS microservice.
 * Also provides LangSmith status and feedback endpoints.
 */

import {
  checkHealth as checkRagasHealth,
  getMetricsInfo,
  evaluateRAGResponse,
  batchEvaluate,
  evaluateFaithfulness,
  evaluateRelevancy,
  RAGAS_SERVICE_URL,
} from '../services/ragasEvaluation.js';
import { getStatus as getLangSmithStatus, logFeedback } from '../config/langsmith.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Get monitoring system status
 * GET /api/v1/evaluation/status
 */
export const getStatus = catchAsync(async (req, res) => {
  const [langsmith, ragas] = await Promise.all([
    Promise.resolve(getLangSmithStatus()),
    checkRagasHealth(),
  ]);

  sendSuccess(res, 200, 'Monitoring status retrieved', {
    langsmith: {
      enabled: langsmith.enabled,
      project: langsmith.project,
      connected: langsmith.hasClient,
    },
    ragas: {
      enabled: ragas.available,
      serviceUrl: RAGAS_SERVICE_URL,
      llmProvider: ragas.llm_provider,
      llmModel: ragas.llm_model,
      availableMetrics: ragas.available_metrics || [],
      error: ragas.error,
    },
  });
});

/**
 * Evaluate a single RAG response
 * POST /api/v1/evaluation/evaluate
 *
 * Body: {
 *   question: string,
 *   answer: string,
 *   contexts: string[],
 *   groundTruth?: string,
 *   metrics?: string[]
 * }
 */
export const evaluateSingle = catchAsync(async (req, res) => {
  const { question, answer, contexts, groundTruth, metrics } = req.body;

  if (!question || !answer || !contexts || contexts.length === 0) {
    return sendError(res, 400, 'Missing required fields: question, answer, contexts (array)');
  }

  logger.info('Starting single RAGAS evaluation', {
    service: 'evaluation',
    questionLength: question.length,
    contextsCount: contexts.length,
  });

  const result = await evaluateRAGResponse({
    question,
    answer,
    contexts,
    groundTruth,
    metrics,
  });

  sendSuccess(res, 200, 'Evaluation completed', result);
});

/**
 * Batch evaluate multiple RAG responses
 * POST /api/v1/evaluation/batch
 *
 * Body: {
 *   samples: Array<{ question, answer, contexts, groundTruth? }>,
 *   metrics?: string[]
 * }
 */
export const evaluateBatch = catchAsync(async (req, res) => {
  const { samples, metrics } = req.body;

  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return sendError(res, 400, 'Missing or empty samples array');
  }

  if (samples.length > 100) {
    return sendError(res, 400, 'Maximum 100 samples per batch');
  }

  // Validate each sample
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.question || !s.answer || !s.contexts || s.contexts.length === 0) {
      return sendError(res, 400, `Sample ${i} missing required fields: question, answer, contexts`);
    }
  }

  logger.info('Starting batch RAGAS evaluation', {
    service: 'evaluation',
    sampleCount: samples.length,
  });

  const result = await batchEvaluate(samples, metrics);

  sendSuccess(res, 200, 'Batch evaluation completed', result);
});

/**
 * Quick faithfulness check
 * POST /api/v1/evaluation/faithfulness
 *
 * Body: { answer, contexts }
 */
export const checkFaithfulness = catchAsync(async (req, res) => {
  const { answer, contexts } = req.body;

  if (!answer || !contexts || contexts.length === 0) {
    return sendError(res, 400, 'Missing required fields: answer, contexts');
  }

  const result = await evaluateFaithfulness(answer, contexts);

  sendSuccess(res, 200, 'Faithfulness evaluation completed', result);
});

/**
 * Quick relevancy check
 * POST /api/v1/evaluation/relevancy
 *
 * Body: { question, answer }
 */
export const checkRelevancy = catchAsync(async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return sendError(res, 400, 'Missing required fields: question, answer');
  }

  const result = await evaluateRelevancy(question, answer);

  sendSuccess(res, 200, 'Relevancy evaluation completed', result);
});

/**
 * Submit feedback to LangSmith for a run
 * POST /api/v1/evaluation/feedback
 *
 * Body: {
 *   runId: string,
 *   score: number (0-1),
 *   comment?: string,
 *   key?: string (default: 'user-rating')
 * }
 */
export const submitFeedback = catchAsync(async (req, res) => {
  const { runId, score, comment, key } = req.body;

  if (!runId || score === undefined) {
    return sendError(res, 400, 'Missing required fields: runId, score');
  }

  if (score < 0 || score > 1) {
    return sendError(res, 400, 'Score must be between 0 and 1');
  }

  const langsmith = getLangSmithStatus();
  if (!langsmith.enabled) {
    return sendError(res, 503, 'LangSmith is not enabled');
  }

  const success = await logFeedback(runId, {
    score,
    comment,
    key: key || 'user-rating',
  });

  if (success) {
    sendSuccess(res, 200, 'Feedback submitted successfully');
  } else {
    sendError(res, 500, 'Failed to submit feedback to LangSmith');
  }
});

/**
 * Get RAGAS metrics information
 * GET /api/v1/evaluation/metrics
 */
export const getMetrics = catchAsync(async (req, res) => {
  const metricsInfo = await getMetricsInfo();
  sendSuccess(res, 200, 'Metrics information retrieved', metricsInfo);
});

/**
 * Health check for RAGAS service
 * GET /api/v1/evaluation/health
 */
export const healthCheck = catchAsync(async (req, res) => {
  const health = await checkRagasHealth();

  if (health.available) {
    sendSuccess(res, 200, 'RAGAS service is healthy', health);
  } else {
    sendError(res, 503, 'RAGAS service is unavailable', health);
  }
});

/**
 * RAGAS Evaluation Client
 *
 * Client for the RAGAS Python microservice.
 * Provides RAG quality evaluation using real RAGAS metrics:
 * - Faithfulness
 * - Answer Relevancy
 * - Context Precision
 * - Context Recall
 */

import axios from 'axios';
import logger from '../config/logger.js';

// Configuration
const RAGAS_SERVICE_URL = process.env.RAGAS_SERVICE_URL || 'http://localhost:8001';
const RAGAS_TIMEOUT = parseInt(process.env.RAGAS_TIMEOUT) || 60000; // 60s default

// Axios instance for RAGAS service
const ragasClient = axios.create({
  baseURL: RAGAS_SERVICE_URL,
  timeout: RAGAS_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Check if RAGAS service is available
 * @returns {Promise<Object>} - Service health status
 */
async function checkHealth() {
  try {
    const response = await ragasClient.get('/health');
    return {
      available: true,
      ...response.data,
    };
  } catch (error) {
    logger.warn('RAGAS service health check failed', {
      service: 'ragas-client',
      error: error.message,
    });
    return {
      available: false,
      error: error.message,
    };
  }
}

/**
 * Get available metrics information
 * @returns {Promise<Object>}
 */
async function getMetricsInfo() {
  try {
    const response = await ragasClient.get('/metrics');
    return response.data;
  } catch (error) {
    logger.error('Failed to get RAGAS metrics info', {
      service: 'ragas-client',
      error: error.message,
    });
    throw new Error(`RAGAS service error: ${error.message}`);
  }
}

/**
 * Evaluate a single RAG response
 * @param {Object} params - Evaluation parameters
 * @param {string} params.question - The user's question
 * @param {string} params.answer - The generated answer
 * @param {Array<string>} params.contexts - Retrieved context passages
 * @param {string} params.groundTruth - Expected answer (optional)
 * @param {Array<string>} params.metrics - Metrics to evaluate (optional)
 * @returns {Promise<Object>} - Evaluation results
 */
async function evaluateRAGResponse(params) {
  const { question, answer, contexts, groundTruth, metrics } = params;

  if (!question || !answer || !contexts || contexts.length === 0) {
    throw new Error('Missing required fields: question, answer, contexts');
  }

  const startTime = Date.now();

  logger.info('Sending evaluation request to RAGAS service', {
    service: 'ragas-client',
    questionLength: question.length,
    contextsCount: contexts.length,
  });

  try {
    const response = await ragasClient.post('/evaluate', {
      question,
      answer,
      contexts,
      ground_truth: groundTruth || null,
      metrics: metrics || [
        'faithfulness',
        'answer_relevancy',
        'context_precision',
        'context_recall',
      ],
    });

    logger.info('RAGAS evaluation completed', {
      service: 'ragas-client',
      overallScore: response.data.overall_score?.toFixed(2),
      evaluationTime: Date.now() - startTime + 'ms',
    });

    return response.data;
  } catch (error) {
    logger.error('RAGAS evaluation failed', {
      service: 'ragas-client',
      error: error.message,
      status: error.response?.status,
    });

    if (error.response) {
      throw new Error(`RAGAS evaluation failed: ${error.response.data?.detail || error.message}`);
    }
    throw new Error(`RAGAS service unavailable: ${error.message}`);
  }
}

/**
 * Batch evaluate multiple RAG responses
 * @param {Array<Object>} samples - Array of evaluation samples
 * @param {Array<string>} metrics - Metrics to evaluate (optional)
 * @returns {Promise<Object>} - Batch evaluation results
 */
async function batchEvaluate(samples, metrics = null) {
  if (!samples || samples.length === 0) {
    throw new Error('At least one sample required');
  }

  if (samples.length > 100) {
    throw new Error('Maximum 100 samples per batch');
  }

  const startTime = Date.now();

  logger.info('Sending batch evaluation to RAGAS service', {
    service: 'ragas-client',
    sampleCount: samples.length,
  });

  try {
    const response = await ragasClient.post('/evaluate/batch', {
      samples: samples.map((s) => ({
        question: s.question,
        answer: s.answer,
        contexts: s.contexts,
        ground_truth: s.groundTruth || null,
      })),
      metrics: metrics || [
        'faithfulness',
        'answer_relevancy',
        'context_precision',
        'context_recall',
      ],
    });

    logger.info('RAGAS batch evaluation completed', {
      service: 'ragas-client',
      totalSamples: response.data.total_samples,
      aggregateScore: response.data.aggregate?.overall?.toFixed(2),
      evaluationTime: Date.now() - startTime + 'ms',
    });

    return response.data;
  } catch (error) {
    logger.error('RAGAS batch evaluation failed', {
      service: 'ragas-client',
      error: error.message,
    });

    if (error.response) {
      throw new Error(
        `RAGAS batch evaluation failed: ${error.response.data?.detail || error.message}`
      );
    }
    throw new Error(`RAGAS service unavailable: ${error.message}`);
  }
}

/**
 * Quick faithfulness check
 * @param {string} answer - The generated answer
 * @param {Array<string>} contexts - Retrieved contexts
 * @returns {Promise<Object>}
 */
async function evaluateFaithfulness(answer, contexts) {
  return evaluateRAGResponse({
    question: '', // Not needed for faithfulness
    answer,
    contexts,
    metrics: ['faithfulness'],
  });
}

/**
 * Quick relevancy check
 * @param {string} question - The question
 * @param {string} answer - The answer
 * @returns {Promise<Object>}
 */
async function evaluateRelevancy(question, answer) {
  return evaluateRAGResponse({
    question,
    answer,
    contexts: [''], // Minimal context for relevancy
    metrics: ['answer_relevancy'],
  });
}

/**
 * Create evaluation samples from RAG responses
 * @param {Array<Object>} responses - RAG responses with sources
 * @returns {Array<Object>} - Formatted evaluation samples
 */
function createEvaluationSamples(responses) {
  return responses.map((r) => ({
    question: r.question,
    answer: r.answer,
    contexts: r.sources?.map((s) => s.content || s.pageContent || s.title) || [],
    groundTruth: r.expectedAnswer || null,
  }));
}

/**
 * Evaluate with fallback (returns null if service unavailable)
 * @param {Object} params - Evaluation parameters
 * @returns {Promise<Object|null>}
 */
async function evaluateWithFallback(params) {
  try {
    const health = await checkHealth();
    if (!health.available) {
      logger.warn('RAGAS service unavailable, skipping evaluation', {
        service: 'ragas-client',
      });
      return null;
    }
    return await evaluateRAGResponse(params);
  } catch (error) {
    logger.warn('RAGAS evaluation failed, returning null', {
      service: 'ragas-client',
      error: error.message,
    });
    return null;
  }
}

export {
  checkHealth,
  getMetricsInfo,
  evaluateRAGResponse,
  batchEvaluate,
  evaluateFaithfulness,
  evaluateRelevancy,
  createEvaluationSamples,
  evaluateWithFallback,
  RAGAS_SERVICE_URL,
};

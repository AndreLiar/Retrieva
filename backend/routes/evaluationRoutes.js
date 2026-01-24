/**
 * Evaluation Routes
 *
 * RAGAS evaluation endpoints for RAG quality assessment.
 * All evaluation endpoints require authentication to prevent:
 * - Denial of service (expensive LLM calls)
 * - Cost attacks (unauthorized token consumption)
 * - Information leakage through evaluation results
 *
 * @module routes/evaluationRoutes
 */

import express from 'express';
import {
  getStatus,
  evaluateSingle,
  evaluateBatch,
  checkFaithfulness,
  checkRelevancy,
  submitFeedback,
  getMetrics,
  healthCheck,
} from '../controllers/evaluationController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// SECURITY FIX: All evaluation routes require authentication
// These endpoints consume LLM resources and must be protected
router.use(authenticate);

/**
 * @route   GET /api/v1/evaluation/status
 * @desc    Get monitoring system status (LangSmith + RAGAS)
 * @access  Private (authenticated users)
 */
router.get('/status', getStatus);

/**
 * @route   GET /api/v1/evaluation/health
 * @desc    Health check for evaluation service
 * @access  Private (authenticated users)
 */
router.get('/health', healthCheck);

/**
 * @route   GET /api/v1/evaluation/metrics
 * @desc    Get RAGAS metrics information
 * @access  Private (authenticated users)
 */
router.get('/metrics', getMetrics);

/**
 * @route   POST /api/v1/evaluation/evaluate
 * @desc    Evaluate a single RAG response
 * @access  Private (authenticated users)
 * @body    { question, answer, contexts, ground_truth? }
 */
router.post('/evaluate', evaluateSingle);

/**
 * @route   POST /api/v1/evaluation/batch
 * @desc    Batch evaluate multiple RAG responses
 * @access  Private (admin only - expensive operation)
 * @body    { evaluations: [...] }
 */
router.post('/batch', authorize('admin'), evaluateBatch);

/**
 * @route   POST /api/v1/evaluation/faithfulness
 * @desc    Quick faithfulness check
 * @access  Private (authenticated users)
 * @body    { question, answer, contexts }
 */
router.post('/faithfulness', checkFaithfulness);

/**
 * @route   POST /api/v1/evaluation/relevancy
 * @desc    Quick relevancy check
 * @access  Private (authenticated users)
 * @body    { question, answer, contexts }
 */
router.post('/relevancy', checkRelevancy);

/**
 * @route   POST /api/v1/evaluation/feedback
 * @desc    Submit feedback to LangSmith
 * @access  Private (authenticated users)
 * @body    { runId, score, comment? }
 */
router.post('/feedback', submitFeedback);

export default router;

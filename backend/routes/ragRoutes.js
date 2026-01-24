import express from 'express';
import { askQuestion, getRoutingStats } from '../controllers/ragController.js';
import { streamRAGResponse } from '../controllers/streamingController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import { askQuestionSchema, streamQuestionSchema } from '../validators/schemas.js';
import {
  ragQueryLimiter,
  ragStreamLimiter,
  ragBurstLimiter,
} from '../middleware/ragRateLimiter.js';
import { detectAbuse, checkTokenLimits } from '../middleware/abuseDetection.js';
import { checkWorkspaceQuota } from '../middleware/workspaceQuota.js';

const router = express.Router();

/**
 * @route   POST /api/v1/rag
 * @desc    Ask a question and get a complete response
 * @access  Private - requires authentication AND workspace membership
 *
 * GUARDRAILS APPLIED:
 * 1. Authentication required
 * 2. Workspace membership required
 * 3. Abuse pattern detection
 * 4. Token usage limit checking (user level)
 * 5. Workspace quota checking (API6:2023 fix)
 * 6. Rate limiting (burst + hourly)
 * 7. Input validation
 */
router.post(
  '/rag',
  authenticate, // Must be logged in
  requireWorkspaceAccess, // Must have workspace access
  detectAbuse, // GUARDRAIL: Detect abuse patterns
  checkTokenLimits, // GUARDRAIL: Check user token usage limits
  checkWorkspaceQuota, // GUARDRAIL: Check workspace quotas (API6:2023)
  ragBurstLimiter, // Block rapid-fire requests (5/10sec)
  ragQueryLimiter, // Hourly limit (100/hr for authenticated)
  validateBody(askQuestionSchema),
  askQuestion
);

/**
 * @route   POST /api/v1/rag/stream
 * @desc    Ask a question and stream the response in real-time
 * @access  Private - requires authentication AND workspace membership
 *
 * GUARDRAILS APPLIED:
 * 1. Authentication required
 * 2. Workspace membership required
 * 3. Abuse pattern detection
 * 4. Token usage limit checking (user level)
 * 5. Workspace quota checking (API6:2023 fix)
 * 6. Rate limiting (burst + hourly)
 * 7. Input validation
 */
router.post(
  '/rag/stream',
  authenticate, // Must be logged in
  requireWorkspaceAccess, // Must have workspace access
  detectAbuse, // GUARDRAIL: Detect abuse patterns
  checkTokenLimits, // GUARDRAIL: Check user token usage limits
  checkWorkspaceQuota, // GUARDRAIL: Check workspace quotas (API6:2023)
  ragBurstLimiter, // Block rapid-fire requests
  ragStreamLimiter, // Stricter hourly limit (50/hr)
  validateBody(streamQuestionSchema),
  streamRAGResponse
);

/**
 * @route   GET /api/v1/rag/stats
 * @desc    Get intent routing statistics
 * @access  Private - requires authentication
 */
router.get('/rag/stats', authenticate, authorize('admin'), getRoutingStats);

export { router as ragRoutes };

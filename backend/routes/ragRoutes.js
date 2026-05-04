import express from 'express';
import { askQuestion, askQuestionStream } from '../controllers/ragController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import { askQuestionSchema, streamQuestionSchema } from '../validators/schemas.js';
import { ragQueryLimiter, ragBurstLimiter } from '../middleware/ragRateLimiter.js';

const router = express.Router();

/**
 * @route   POST /api/v1/rag
 * @desc    Ask a question and get a complete response
 * @access  Private - requires authentication AND workspace membership
 */
router.post(
  '/rag',
  authenticate,
  requireWorkspaceAccess,
  ragBurstLimiter,
  ragQueryLimiter,
  validateBody(askQuestionSchema),
  askQuestion
);

/**
 * @route   POST /api/v1/rag/stream
 * @desc    Ask a question and stream the answer over SSE
 * @access  Private - requires authentication AND workspace membership
 */
router.post(
  '/rag/stream',
  authenticate,
  requireWorkspaceAccess,
  ragBurstLimiter,
  ragQueryLimiter,
  validateBody(streamQuestionSchema),
  askQuestionStream
);

export { router as ragRoutes };

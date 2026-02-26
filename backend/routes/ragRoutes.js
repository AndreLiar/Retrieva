import express from 'express';
import { askQuestion } from '../controllers/ragController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import { askQuestionSchema } from '../validators/schemas.js';
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

export { router as ragRoutes };

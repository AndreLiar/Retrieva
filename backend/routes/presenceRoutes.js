/**
 * Presence Routes
 *
 * Provides API routes for user presence:
 * - Online users in workspace
 * - Typing indicators
 * - Presence statistics
 *
 * @module routes/presenceRoutes
 */

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { presenceController } from '../controllers/presenceController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/presence/stats
 * @description Get global presence statistics
 * @access Private (admin only)
 */
router.get('/stats', authorize('admin'), presenceController.getPresenceStats);

/**
 * @route GET /api/v1/presence/:workspaceId
 * @description Get online users in a workspace
 * @access Private (workspace members only)
 */
router.get('/:workspaceId', presenceController.getWorkspacePresence);

/**
 * @route GET /api/v1/presence/:workspaceId/count
 * @description Get online count for a workspace
 * @access Private (workspace members only)
 */
router.get('/:workspaceId/count', presenceController.getWorkspaceOnlineCount);

/**
 * @route GET /api/v1/presence/:workspaceId/typing/:conversationId
 * @description Get users currently typing in a conversation
 * @access Private (workspace members only)
 */
router.get('/:workspaceId/typing/:conversationId', presenceController.getTypingUsers);

export default router;

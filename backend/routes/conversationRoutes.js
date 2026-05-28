import express from 'express';
import {
  createConversation,
  getConversations,
  getConversation,
  askQuestion,
  updateConversation,
  deleteConversation,
  bulkDeleteConversations,
} from '../controllers/conversationController.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createConversationSchema,
  updateConversationSchema,
  askInConversationSchema,
  bulkDeleteConversationsSchema,
  idParamsSchema,
  listConversationsQuerySchema,
} from '../validators/schemas.js';

const router = express.Router();

// Conversation management — every route requires authentication AND workspace
// access. requireWorkspaceAccess rejects an X-Workspace-Id the caller is not a
// member of; per-conversation access is further enforced by ownership (BOLA)
// checks in the controllers/services.
router.post(
  '/',
  authenticate,
  requireWorkspaceAccess,
  validateBody(createConversationSchema),
  createConversation
);
router.get(
  '/',
  authenticate,
  requireWorkspaceAccess,
  validateQuery(listConversationsQuerySchema),
  getConversations
);
router.post(
  '/bulk-delete',
  authenticate,
  requireWorkspaceAccess,
  validateBody(bulkDeleteConversationsSchema),
  bulkDeleteConversations
); // Must be before /:id routes
router.get(
  '/:id',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  getConversation
);
router.patch(
  '/:id',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  validateBody(updateConversationSchema),
  updateConversation
);
router.delete(
  '/:id',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  deleteConversation
);

// Ask question in conversation
router.post(
  '/:id/ask',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  validateBody(askInConversationSchema),
  askQuestion
);

export { router as conversationRoutes };

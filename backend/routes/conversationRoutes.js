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

// Conversation management — all routes require authentication
// Conversations are user-scoped (userId), not workspace-scoped
// Users can only access their own conversations (BOLA protection in controllers)
router.post(
  '/',
  authenticate,
  requireWorkspaceAccess,
  validateBody(createConversationSchema),
  createConversation
);
router.get('/', authenticate, validateQuery(listConversationsQuerySchema), getConversations);
router.post(
  '/bulk-delete',
  authenticate,
  validateBody(bulkDeleteConversationsSchema),
  bulkDeleteConversations
); // Must be before /:id routes
router.get('/:id', authenticate, validateParams(idParamsSchema), getConversation);
router.patch(
  '/:id',
  authenticate,
  validateParams(idParamsSchema),
  validateBody(updateConversationSchema),
  updateConversation
);
router.delete('/:id', authenticate, validateParams(idParamsSchema), deleteConversation);

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

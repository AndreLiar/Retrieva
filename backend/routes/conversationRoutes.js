import express from 'express';
import {
  createConversation,
  getConversations,
  getConversation,
  askQuestion,
  updateConversation,
  deleteConversation,
} from '../controllers/conversationController.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';

const router = express.Router();

// SECURITY: All conversation routes require authentication
// No anonymous access - users must be logged in and have workspace access
router.use(authenticate);
router.use(requireWorkspaceAccess);

// Conversation management
router.post('/', createConversation);
router.get('/', getConversations);
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);

// Ask question in conversation
router.post('/:id/ask', askQuestion);

export { router as conversationRoutes };

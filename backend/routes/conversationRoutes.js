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

const router = express.Router();

// Conversation management — all routes require authentication
// Conversations are user-scoped (userId), not workspace-scoped
// Users can only access their own conversations (BOLA protection in controllers)
router.post('/', authenticate, createConversation);
router.get('/', authenticate, getConversations);
router.post('/bulk-delete', authenticate, bulkDeleteConversations); // Must be before /:id routes
router.get('/:id', authenticate, getConversation);
router.patch('/:id', authenticate, updateConversation);
router.delete('/:id', authenticate, deleteConversation);

// Ask question in conversation
router.post('/:id/ask', authenticate, askQuestion);

export { router as conversationRoutes };

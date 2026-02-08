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

// SECURITY: All conversation routes require authentication
// Conversations are user-scoped (userId), not workspace-scoped
// Users can only access their own conversations (BOLA protection in controllers)
router.use(authenticate);

// Conversation management
router.post('/', createConversation);
router.get('/', getConversations);
router.post('/bulk-delete', bulkDeleteConversations); // Must be before /:id routes
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);

// Ask question in conversation
router.post('/:id/ask', askQuestion);

export { router as conversationRoutes };

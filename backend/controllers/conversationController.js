import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ragService } from '../services/rag.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Create a new conversation
 * POST /api/v1/conversations
 */
export const createConversation = catchAsync(async (req, res) => {
  const { title } = req.body;
  // SECURITY FIX (GAP 26): Use authenticated user ID, not request body
  const userId = req.user?.userId || 'anonymous';

  const conversation = await Conversation.create({
    title: title || 'New Conversation',
    userId,
  });

  logger.info('Created new conversation', {
    service: 'conversation',
    conversationId: conversation._id,
  });

  sendSuccess(res, 201, 'Conversation created successfully', {
    conversation: {
      id: conversation._id,
      title: conversation.title,
      userId: conversation.userId,
      createdAt: conversation.createdAt,
    },
  });
});

/**
 * Get all conversations for a user
 * GET /api/v1/conversations
 */
export const getConversations = catchAsync(async (req, res) => {
  // SECURITY FIX (GAP 26): Use authenticated user ID, not query parameter
  const userId = req.user?.userId || 'anonymous';
  // SECURITY FIX: Bound pagination parameters to prevent abuse
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);

  const conversations = await Conversation.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('title userId messageCount lastMessageAt createdAt updatedAt');

  const total = await Conversation.countDocuments({ userId });

  sendSuccess(res, 200, 'Conversations retrieved successfully', {
    conversations: conversations.map((c) => ({
      id: c._id,
      title: c.title,
      userId: c.userId,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    },
  });
});

/**
 * Get a specific conversation with messages
 * GET /api/v1/conversations/:id
 */
export const getConversation = catchAsync(async (req, res) => {
  const { id } = req.params;
  // SECURITY FIX: Bound pagination parameters
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const userId = req.user?.userId || 'anonymous';

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  // SECURITY FIX (GAP 26): Verify ownership - use string comparison for ObjectId compatibility
  const conversationOwner = conversation.userId?.toString() || conversation.userId;
  const requestUser = userId?.toString() || userId;

  if (conversationOwner !== requestUser) {
    logger.warn('Unauthorized conversation access attempt', {
      service: 'conversation',
      conversationId: id,
      requestUserId: requestUser,
      ownerUserId: conversationOwner,
      typeConv: typeof conversation.userId,
      typeReq: typeof userId,
    });
    return sendError(res, 403, 'Access denied');
  }

  const messages = await Message.find({ conversationId: id })
    .sort({ timestamp: 1 })
    .limit(limit)
    .skip(skip)
    .select('role content timestamp');

  const totalMessages = await Message.countDocuments({ conversationId: id });

  sendSuccess(res, 200, 'Conversation retrieved successfully', {
    conversation: {
      id: conversation._id,
      title: conversation.title,
      userId: conversation.userId,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })),
    pagination: {
      total: totalMessages,
      limit,
      skip,
      hasMore: skip + limit < totalMessages,
    },
  });
});

/**
 * Ask a question in a conversation
 * POST /api/v1/conversations/:id/ask
 */
export const askQuestion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { question, filters } = req.body;
  const userId = req.user?.userId || 'anonymous';

  if (!question || question.trim().length === 0) {
    return sendError(res, 400, 'Question is required');
  }

  if (question.length > 5000) {
    return sendError(res, 400, 'Question is too long (max 5000 characters)');
  }

  // Verify conversation exists
  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  // SECURITY FIX (GAP 26): Verify ownership
  if (conversation.userId?.toString() !== userId?.toString()) {
    return sendError(res, 403, 'Access denied');
  }

  logger.info('Processing question in conversation', {
    service: 'conversation',
    conversationId: id,
    questionLength: question.length,
    filters: filters || 'none', // Enhancement 12: Log filters
  });

  // Enhancement 12: Use RAG service with optional filters
  const answer = await ragService.askWithConversation(question, {
    conversationId: id,
    filters: filters || null,
  });

  sendSuccess(res, 200, 'Question answered successfully', {
    answer,
    conversationId: id,
  });
});

/**
 * Update conversation (e.g., change title)
 * PATCH /api/v1/conversations/:id
 */
export const updateConversation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const userId = req.user?.userId || 'anonymous';

  if (!title || title.trim().length === 0) {
    return sendError(res, 400, 'Title is required');
  }

  // SECURITY FIX (GAP 26): First check ownership, then update
  const existingConversation = await Conversation.findById(id);
  if (!existingConversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  if (existingConversation.userId?.toString() !== userId?.toString()) {
    return sendError(res, 403, 'Access denied');
  }

  const conversation = await Conversation.findByIdAndUpdate(
    id,
    { title: title.trim() },
    { new: true, runValidators: true }
  );

  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  logger.info('Updated conversation', {
    service: 'conversation',
    conversationId: id,
    newTitle: title,
  });

  sendSuccess(res, 200, 'Conversation updated successfully', {
    conversation: {
      id: conversation._id,
      title: conversation.title,
      userId: conversation.userId,
      updatedAt: conversation.updatedAt,
    },
  });
});

/**
 * Delete a conversation and all its messages
 * DELETE /api/v1/conversations/:id
 */
export const deleteConversation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.userId || 'anonymous';

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  // SECURITY FIX (GAP 26): Verify ownership before deletion
  if (conversation.userId?.toString() !== userId?.toString()) {
    return sendError(res, 403, 'Access denied');
  }

  // Delete all messages in the conversation
  await Message.deleteMany({ conversationId: id });

  // Delete the conversation
  await Conversation.findByIdAndDelete(id);

  logger.info('Deleted conversation and all messages', {
    service: 'conversation',
    conversationId: id,
  });

  sendSuccess(res, 200, 'Conversation deleted successfully', {
    deletedId: id,
  });
});

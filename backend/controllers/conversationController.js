import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { ragService } from '../services/rag.js';
import {
  catchAsync,
  sendSuccess,
  sendError,
  getUserId,
  parsePagination,
  verifyOwnership,
} from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Get user's primary workspace ID (first active workspace they belong to)
 * @param {string} userId - User's MongoDB ID
 * @returns {Promise<string|null>} Workspace ID or null if none found
 */
async function getUserPrimaryWorkspace(userId) {
  const membership = await WorkspaceMember.findOne({
    userId,
    status: 'active',
  }).populate('workspaceId', 'workspaceId');

  return membership?.workspaceId?.workspaceId || null;
}

/**
 * Create a new conversation
 * POST /api/v1/conversations
 *
 * FIX: Auto-assign user's workspace if not provided (fixes "default" workspace issue)
 * ISSUE #25 FIX: Added idempotency key support to prevent race conditions
 */
export const createConversation = catchAsync(async (req, res) => {
  // ISSUE #15 FIX: Sanitize logged data - don't log full request body
  // which may contain sensitive user content
  logger.debug('createConversation called', {
    hasTitle: !!req.body?.title,
    hasWorkspaceId: !!(req.headers['x-workspace-id'] || req.body?.workspaceId),
    userId: req.user?.userId,
  });

  const { title } = req.body;
  const userId = getUserId(req);

  // ISSUE #25 FIX: Support idempotency key to prevent duplicate creations
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;

  // Get workspaceId from header, body, query, or auto-lookup user's workspace
  let workspaceId = req.headers['x-workspace-id'] || req.body.workspaceId || req.query.workspaceId;

  // If no workspace specified, auto-lookup user's primary workspace
  if (!workspaceId) {
    workspaceId = await getUserPrimaryWorkspace(userId);
    if (workspaceId) {
      logger.info('Auto-assigned user workspace', {
        service: 'conversation',
        userId,
        workspaceId,
      });
    }
  }

  logger.info('Creating conversation', {
    service: 'conversation',
    userId,
    workspaceId: workspaceId || 'default',
    title,
    hasIdempotencyKey: !!idempotencyKey,
  });

  const conversationData = {
    title: title || 'New Conversation',
    userId,
    workspaceId: workspaceId || 'default',
  };

  let conversation;
  let wasCreated = true;

  // ISSUE #25 FIX: If idempotency key provided, use findOneAndUpdate to prevent duplicates
  if (idempotencyKey) {
    const result = await Conversation.findOneAndUpdate(
      {
        userId,
        workspaceId: conversationData.workspaceId,
        'metadata.idempotencyKey': idempotencyKey,
      },
      {
        $setOnInsert: {
          ...conversationData,
          metadata: { idempotencyKey },
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        rawResult: true,
      }
    );
    conversation = result.value;
    wasCreated = result.lastErrorObject?.upserted !== undefined;

    if (!wasCreated) {
      logger.info('Returning existing conversation (idempotent request)', {
        service: 'conversation',
        conversationId: conversation._id,
        idempotencyKey,
      });
    }
  } else {
    conversation = await Conversation.create(conversationData);
  }

  logger.info(wasCreated ? 'Created new conversation' : 'Retrieved existing conversation', {
    service: 'conversation',
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    wasCreated,
  });

  sendSuccess(res, wasCreated ? 201 : 200, 'Conversation created successfully', {
    conversation: {
      id: conversation._id,
      title: conversation.title,
      userId: conversation.userId,
      workspaceId: conversation.workspaceId,
      createdAt: conversation.createdAt,
    },
  });
});

/**
 * Get all conversations for a user
 * GET /api/v1/conversations
 *
 * SECURITY FIX: Filter by workspaceId for tenant isolation
 * ISSUE #22 FIX: Added .lean() for read-only query
 * ISSUE #23 FIX: Parallelized find and count queries
 */
export const getConversations = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  // Get workspaceId from header
  const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId;

  // Build query filter
  const query = { userId };
  if (workspaceId) {
    query.workspaceId = workspaceId;
  }

  // ISSUE #23 FIX: Run find and count in parallel
  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .select('title userId workspaceId messageCount lastMessageAt createdAt updatedAt')
      .lean(), // ISSUE #22 FIX: Use lean() for read-only queries
    Conversation.countDocuments(query),
  ]);

  sendSuccess(res, 200, 'Conversations retrieved successfully', {
    conversations: conversations.map((c) => ({
      id: c._id,
      title: c.title,
      userId: c.userId,
      workspaceId: c.workspaceId,
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
 * ISSUE #22 FIX: Added .lean() for read-only queries
 * ISSUE #23 FIX: Parallelized message queries after auth check
 */
export const getConversation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
  const userId = getUserId(req);

  // Need full document for ownership check first
  const conversation = await Conversation.findById(id).lean();
  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  if (!verifyOwnership(conversation.userId, userId)) {
    logger.warn('Unauthorized conversation access attempt', {
      service: 'conversation',
      conversationId: id,
      requestUserId: userId,
      ownerUserId: conversation.userId,
    });
    return sendError(res, 403, 'Access denied');
  }

  // ISSUE #23 FIX: Parallelize message fetch and count after auth check
  const [messages, totalMessages] = await Promise.all([
    Message.find({ conversationId: id })
      .sort({ timestamp: 1 })
      .limit(limit)
      .skip(skip)
      .select('role content sources timestamp')
      .lean(), // ISSUE #22 FIX
    Message.countDocuments({ conversationId: id }),
  ]);

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
      sources: m.sources || [],
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
  const userId = getUserId(req);

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

  if (!verifyOwnership(conversation.userId, userId)) {
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
  const userId = getUserId(req);

  if (!title || title.trim().length === 0) {
    return sendError(res, 400, 'Title is required');
  }

  const existingConversation = await Conversation.findById(id);
  if (!existingConversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  if (!verifyOwnership(existingConversation.userId, userId)) {
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
  const userId = getUserId(req);

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  if (!verifyOwnership(conversation.userId, userId)) {
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

/**
 * Bulk delete multiple conversations and their messages
 * POST /api/v1/conversations/bulk-delete
 * Body: { ids: ["id1", "id2", ...] }
 */
export const bulkDeleteConversations = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const userId = getUserId(req);

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return sendError(res, 400, 'ids array is required');
  }

  if (ids.length > 100) {
    return sendError(res, 400, 'Cannot delete more than 100 conversations at once');
  }

  // Verify all conversations belong to the user
  // ISSUE #22 FIX: Use .lean() for read-only query
  const conversations = await Conversation.find({
    _id: { $in: ids },
    userId: userId,
  }).lean();

  if (conversations.length === 0) {
    return sendError(res, 404, 'No conversations found');
  }

  const validIds = conversations.map((c) => c._id);
  const invalidCount = ids.length - validIds.length;

  // Delete all messages for these conversations
  await Message.deleteMany({ conversationId: { $in: validIds } });

  // Delete the conversations
  const deleteResult = await Conversation.deleteMany({ _id: { $in: validIds } });

  logger.info('Bulk deleted conversations', {
    service: 'conversation',
    requestedCount: ids.length,
    deletedCount: deleteResult.deletedCount,
    invalidCount,
    userId,
  });

  sendSuccess(res, 200, 'Conversations deleted successfully', {
    deletedCount: deleteResult.deletedCount,
    deletedIds: validIds,
    invalidCount,
  });
});

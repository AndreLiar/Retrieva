import { conversationService } from '../services/ConversationService.js';
import { catchAsync, sendSuccess, getUserId, parsePagination } from '../utils/index.js';
import { userCanViewSources } from '../utils/security/sourceVisibility.js';
import logger from '../config/logger.js';

/**
 * Create a new conversation
 * POST /api/v1/conversations
 */
export const createConversation = catchAsync(async (req, res) => {
  logger.debug('createConversation called', {
    hasTitle: !!req.body?.title,
    hasWorkspaceId: !!(req.headers['x-workspace-id'] || req.body?.workspaceId),
    userId: req.user?.userId,
  });

  const { title } = req.body;
  const userId = getUserId(req);
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  const workspaceId =
    req.headers['x-workspace-id'] || req.body.workspaceId || req.query.workspaceId;

  const { conversation, wasCreated } = await conversationService.createConversation({
    userId,
    title,
    workspaceId,
    idempotencyKey,
  });

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
 */
export const getConversations = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId;

  const { conversations, total } = await conversationService.listConversations(userId, {
    workspaceId,
    limit,
    skip,
  });

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
 */
export const getConversation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
  const userId = getUserId(req);

  const { conversation, messages, totalMessages } = await conversationService.getConversation(
    id,
    userId,
    { limit, skip }
  );

  // B1: strip per-message sources when the member can't view sources.
  const allowSources = await userCanViewSources(req, conversation.workspaceId);

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
      sources: allowSources ? m.sources || [] : [],
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

  const answer = await conversationService.askQuestion(id, userId, {
    question,
    filters,
    authorizedWorkspaceIds: req.authorizedWorkspaces?.map((w) => w.workspaceId) || [],
  });

  // B1: honor the workspace canViewSources permission before returning sources.
  const workspaceId = req.headers?.['x-workspace-id'] || req.body?.workspaceId;
  if (answer?.sources?.length && !(await userCanViewSources(req, workspaceId))) {
    answer.sources = [];
  }

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

  const conversation = await conversationService.updateConversation(id, userId, { title });

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

  await conversationService.deleteConversation(id, userId);

  sendSuccess(res, 200, 'Conversation deleted successfully', { deletedId: id });
});

/**
 * Bulk delete multiple conversations and their messages
 * POST /api/v1/conversations/bulk-delete
 */
export const bulkDeleteConversations = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const userId = getUserId(req);

  const result = await conversationService.bulkDelete(ids, userId);

  sendSuccess(res, 200, 'Conversations deleted successfully', result);
});

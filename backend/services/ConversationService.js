import { AppError } from '../utils/index.js';
import { verifyOwnership } from '../utils/index.js';
import { conversationRepository } from '../repositories/ConversationRepository.js';
import { messageRepository } from '../repositories/MessageRepository.js';
import { workspaceMemberRepository } from '../repositories/WorkspaceMemberRepository.js';
import { ragService } from './rag.js';
import logger from '../config/logger.js';

class ConversationService {
  constructor(deps = {}) {
    this.conversationRepo = deps.conversationRepo || conversationRepository;
    this.messageRepo = deps.messageRepo || messageRepository;
    this.workspaceMemberRepo = deps.workspaceMemberRepo || workspaceMemberRepository;
    this.ragService = deps.ragService || ragService;
    this.logger = deps.logger || logger;
  }

  async getUserPrimaryWorkspace(userId) {
    const membership = await this.workspaceMemberRepo.findOne(
      { userId, status: 'active' },
      { populate: { path: 'workspaceId', select: '_id' } }
    );
    return membership?.workspaceId?._id?.toString() || null;
  }

  async createConversation({ userId, title, workspaceId, idempotencyKey }) {
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      resolvedWorkspaceId = await this.getUserPrimaryWorkspace(userId);
      if (resolvedWorkspaceId) {
        this.logger.info('Auto-assigned user workspace', {
          service: 'conversation',
          userId,
          workspaceId: resolvedWorkspaceId,
        });
      }
    }

    const conversationData = {
      title: title || 'New Conversation',
      userId,
      workspaceId: resolvedWorkspaceId || 'default',
    };

    if (idempotencyKey) {
      const result = await this.conversationRepo.updateOne(
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
        { upsert: true, setDefaultsOnInsert: true, rawResult: true }
      );

      const conversation = result.value;
      const wasCreated = result.lastErrorObject?.upserted !== undefined;

      if (!wasCreated) {
        this.logger.info('Returning existing conversation (idempotent request)', {
          service: 'conversation',
          conversationId: conversation._id,
          idempotencyKey,
        });
      }
      return { conversation, wasCreated };
    }

    const conversation = await this.conversationRepo.create(conversationData);
    return { conversation, wasCreated: true };
  }

  async listConversations(userId, { workspaceId, limit, skip }) {
    const query = { userId };
    if (workspaceId) query.workspaceId = workspaceId;

    const [conversations, total] = await Promise.all([
      this.conversationRepo.find(query, {
        sort: { updatedAt: -1 },
        limit,
        skip,
        select: 'title userId workspaceId messageCount lastMessageAt createdAt updatedAt',
        lean: true,
      }),
      this.conversationRepo.count(query),
    ]);

    return { conversations, total };
  }

  async getConversation(id, userId, { limit, skip }) {
    const conversation = await this.conversationRepo.findById(id, { lean: true });
    if (!conversation) throw new AppError('Conversation not found', 404);

    if (!verifyOwnership(conversation.userId, userId)) {
      this.logger.warn('Unauthorized conversation access attempt', {
        service: 'conversation',
        conversationId: id,
        requestUserId: userId,
        ownerUserId: conversation.userId,
      });
      throw new AppError('Access denied', 403);
    }

    const [messages, totalMessages] = await Promise.all([
      this.messageRepo.findByConversation(id, {
        limit,
        skip,
        select: 'role content sources timestamp',
        lean: true,
      }),
      this.messageRepo.count({ conversationId: id }),
    ]);

    return { conversation, messages, totalMessages };
  }

  async askQuestion(id, userId, { question, filters, authorizedWorkspaceIds = null }) {
    if (!question || question.trim().length === 0) {
      throw new AppError('Question is required', 400);
    }
    if (question.length > 5000) {
      throw new AppError('Question is too long (max 5000 characters)', 400);
    }

    const conversation = await this.conversationRepo.findById(id);
    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!verifyOwnership(conversation.userId, userId)) {
      throw new AppError('Access denied', 403);
    }

    this.logger.info('Processing question in conversation', {
      service: 'conversation',
      conversationId: id,
      questionLength: question.length,
      filters: filters || 'none',
    });

    return this.ragService.askWithConversation(question, {
      conversationId: id,
      filters: filters || null,
      userId,
      authorizedWorkspaceIds,
    });
  }

  async updateConversation(id, userId, { title }) {
    if (!title || title.trim().length === 0) {
      throw new AppError('Title is required', 400);
    }

    const existing = await this.conversationRepo.findById(id);
    if (!existing) throw new AppError('Conversation not found', 404);
    if (!verifyOwnership(existing.userId, userId)) {
      throw new AppError('Access denied', 403);
    }

    const conversation = await this.conversationRepo.updateById(id, { title: title.trim() });
    if (!conversation) throw new AppError('Conversation not found', 404);
    return conversation;
  }

  async deleteConversation(id, userId) {
    const conversation = await this.conversationRepo.findById(id);
    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!verifyOwnership(conversation.userId, userId)) {
      throw new AppError('Access denied', 403);
    }

    await this.messageRepo.deleteMany({ conversationId: id });
    await this.conversationRepo.deleteById(id);

    this.logger.info('Deleted conversation and all messages', {
      service: 'conversation',
      conversationId: id,
    });
  }

  async bulkDelete(ids, userId) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids array is required', 400);
    }
    if (ids.length > 100) {
      throw new AppError('Cannot delete more than 100 conversations at once', 400);
    }

    const conversations = await this.conversationRepo.find(
      { _id: { $in: ids }, userId },
      { lean: true }
    );

    if (conversations.length === 0) {
      throw new AppError('No conversations found', 404);
    }

    const validIds = conversations.map((c) => c._id);
    const invalidCount = ids.length - validIds.length;

    await this.messageRepo.deleteMany({ conversationId: { $in: validIds } });
    const deleteResult = await this.conversationRepo.deleteMany({ _id: { $in: validIds } });

    this.logger.info('Bulk deleted conversations', {
      service: 'conversation',
      requestedCount: ids.length,
      deletedCount: deleteResult.deletedCount,
      invalidCount,
      userId,
    });

    return {
      deletedCount: deleteResult.deletedCount,
      deletedIds: validIds,
      invalidCount,
    };
  }
}

export const conversationService = new ConversationService();
export { ConversationService };

/**
 * Conversation Repository
 *
 * Encapsulates all data access for Conversation model.
 * Provides common query patterns for chat conversations.
 */

import { BaseRepository } from './BaseRepository.js';
import { Conversation } from '../models/Conversation.js';

class ConversationRepository extends BaseRepository {
  constructor(model = Conversation) {
    super(model);
  }

  /**
   * Find conversations by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByUser(userId, options = {}) {
    return this.find(
      { userId },
      {
        sort: { updatedAt: -1 },
        ...options,
      }
    );
  }

  /**
   * Get user's conversations paginated
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>}
   */
  async findByUserPaginated(userId, options = {}) {
    return this.findPaginated(
      { userId },
      {
        sort: { updatedAt: -1 },
        select: 'title userId messageCount lastMessageAt createdAt updatedAt',
        ...options,
      }
    );
  }

  /**
   * Create a new conversation
   * @param {Object} data - Conversation data
   * @returns {Promise<Document>}
   */
  async createConversation(data) {
    return this.create({
      title: data.title || 'New Conversation',
      userId: data.userId || 'anonymous',
    });
  }

  /**
   * Update conversation title
   * @param {string} id - Conversation ID
   * @param {string} title - New title
   * @returns {Promise<Document>}
   */
  async updateTitle(id, title) {
    return this.updateById(id, { title: title.trim() });
  }

  /**
   * Increment message count
   * @param {string} id - Conversation ID
   * @param {number} count - Number to increment (default 1)
   * @returns {Promise<Document>}
   */
  async incrementMessageCount(id, count = 1) {
    return this.model.findByIdAndUpdate(
      id,
      {
        $inc: { messageCount: count },
        $set: { lastMessageAt: new Date() },
      },
      { new: true }
    );
  }

  /**
   * Update last message timestamp
   * @param {string} id - Conversation ID
   * @returns {Promise<Document>}
   */
  async touchLastMessage(id) {
    return this.updateById(id, { lastMessageAt: new Date() });
  }

  /**
   * Get recent conversations for user
   * @param {string} userId - User ID
   * @param {number} limit - Number of conversations
   * @returns {Promise<Array>}
   */
  async getRecentConversations(userId, limit = 10) {
    return this.find(
      { userId },
      {
        sort: { updatedAt: -1 },
        limit,
        select: 'title messageCount lastMessageAt createdAt',
      }
    );
  }

  /**
   * Search conversations by title
   * @param {string} userId - User ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async searchByTitle(userId, searchTerm, options = {}) {
    return this.find(
      {
        userId,
        title: { $regex: searchTerm, $options: 'i' },
      },
      { sort: { updatedAt: -1 }, ...options }
    );
  }

  /**
   * Get active conversations (with recent messages)
   * @param {string} userId - User ID
   * @param {number} daysActive - Days to consider active
   * @returns {Promise<Array>}
   */
  async getActiveConversations(userId, daysActive = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysActive);

    return this.find(
      {
        userId,
        lastMessageAt: { $gte: cutoffDate },
      },
      { sort: { lastMessageAt: -1 } }
    );
  }

  /**
   * Delete conversation and return its data
   * @param {string} id - Conversation ID
   * @returns {Promise<Document|null>}
   */
  async deleteConversation(id) {
    return this.deleteById(id);
  }

  /**
   * Delete all conversations for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async deleteUserConversations(userId) {
    return this.deleteMany({ userId });
  }

  /**
   * Count conversations for user
   * @param {string} userId - User ID
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    return this.count({ userId });
  }

  /**
   * Get conversation with message stats
   * @param {string} id - Conversation ID
   * @returns {Promise<Object|null>}
   */
  async getWithStats(id) {
    const conversation = await this.findById(id);
    if (!conversation) return null;

    return {
      id: conversation._id,
      title: conversation.title,
      userId: conversation.userId,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      daysOld: Math.floor((Date.now() - conversation.createdAt) / (1000 * 60 * 60 * 24)),
    };
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getUserStats(userId) {
    const result = await this.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          totalMessages: { $sum: '$messageCount' },
          avgMessagesPerConversation: { $avg: '$messageCount' },
          oldestConversation: { $min: '$createdAt' },
          newestConversation: { $max: '$createdAt' },
        },
      },
    ]);

    return (
      result[0] || {
        totalConversations: 0,
        totalMessages: 0,
        avgMessagesPerConversation: 0,
        oldestConversation: null,
        newestConversation: null,
      }
    );
  }

  /**
   * Get empty conversations (no messages)
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getEmptyConversations(userId) {
    return this.find({ userId, messageCount: 0 }, { sort: { createdAt: -1 } });
  }

  /**
   * Clean up old empty conversations
   * @param {string} userId - User ID
   * @param {number} daysOld - Delete empty conversations older than this
   * @returns {Promise<Object>}
   */
  async cleanupEmptyConversations(userId, daysOld = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.deleteMany({
      userId,
      messageCount: 0,
      createdAt: { $lt: cutoffDate },
    });
  }
}

// Singleton instance for backward compatibility
const conversationRepository = new ConversationRepository();

export { ConversationRepository, conversationRepository };

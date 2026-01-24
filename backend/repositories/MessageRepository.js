/**
 * Message Repository
 *
 * Encapsulates all data access for Message model.
 * Provides common query patterns for chat messages.
 */

import { BaseRepository } from './BaseRepository.js';
import { Message } from '../models/Message.js';

class MessageRepository extends BaseRepository {
  constructor(model = Message) {
    super(model);
  }

  /**
   * Get messages for a conversation
   * @param {string} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByConversation(conversationId, options = {}) {
    return this.find(
      { conversationId },
      {
        sort: { timestamp: 1 },
        ...options,
      }
    );
  }

  /**
   * Get recent messages for a conversation (with limit)
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Number of messages
   * @returns {Promise<Array>}
   */
  async getRecentMessages(conversationId, limit = 20) {
    // Get last N messages, then sort by timestamp ascending
    const messages = await this.find(
      { conversationId },
      {
        sort: { timestamp: -1 },
        limit,
      }
    );
    return messages.reverse();
  }

  /**
   * Get messages for LangChain history (formatted)
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Number of messages
   * @returns {Promise<Array>}
   */
  async getChatHistory(conversationId, limit = 20) {
    const messages = await this.getRecentMessages(conversationId, limit);
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Add a user message
   * @param {string} conversationId - Conversation ID
   * @param {string} content - Message content
   * @returns {Promise<Document>}
   */
  async addUserMessage(conversationId, content) {
    return this.create({
      conversationId,
      role: 'user',
      content,
    });
  }

  /**
   * Add an assistant message
   * @param {string} conversationId - Conversation ID
   * @param {string} content - Message content
   * @returns {Promise<Document>}
   */
  async addAssistantMessage(conversationId, content) {
    return this.create({
      conversationId,
      role: 'assistant',
      content,
    });
  }

  /**
   * Add a message pair (user + assistant)
   * @param {string} conversationId - Conversation ID
   * @param {string} userMessage - User message content
   * @param {string} assistantMessage - Assistant message content
   * @returns {Promise<Array>}
   */
  async addMessagePair(conversationId, userMessage, assistantMessage) {
    return this.createMany([
      {
        conversationId,
        role: 'user',
        content: userMessage,
      },
      {
        conversationId,
        role: 'assistant',
        content: assistantMessage,
      },
    ]);
  }

  /**
   * Delete all messages in a conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>}
   */
  async deleteByConversation(conversationId) {
    return this.deleteMany({ conversationId });
  }

  /**
   * Count messages in a conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<number>}
   */
  async countByConversation(conversationId) {
    return this.count({ conversationId });
  }

  /**
   * Get message count by role
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>}
   */
  async countByRole(conversationId) {
    const result = await this.aggregate([
      { $match: { conversationId: this.model.base.Types.ObjectId(conversationId) } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = { user: 0, assistant: 0 };
    for (const item of result) {
      counts[item._id] = item.count;
    }
    return counts;
  }

  /**
   * Search messages by content
   * @param {string} conversationId - Conversation ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async searchInConversation(conversationId, searchTerm, options = {}) {
    return this.find(
      {
        conversationId,
        content: { $regex: searchTerm, $options: 'i' },
      },
      { sort: { timestamp: 1 }, ...options }
    );
  }

  /**
   * Get messages within time range
   * @param {string} conversationId - Conversation ID
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @returns {Promise<Array>}
   */
  async findInTimeRange(conversationId, startTime, endTime) {
    const query = { conversationId };
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }
    return this.find(query, { sort: { timestamp: 1 } });
  }

  /**
   * Get last message in conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Document|null>}
   */
  async getLastMessage(conversationId) {
    const messages = await this.find({ conversationId }, { sort: { timestamp: -1 }, limit: 1 });
    return messages[0] || null;
  }

  /**
   * Get first message in conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Document|null>}
   */
  async getFirstMessage(conversationId) {
    const messages = await this.find({ conversationId }, { sort: { timestamp: 1 }, limit: 1 });
    return messages[0] || null;
  }
}

// Singleton instance for backward compatibility
const messageRepository = new MessageRepository();

export { MessageRepository, messageRepository };

import mongoose from 'mongoose';

/**
 * ConversationSummary Model
 *
 * M4 WORKING MEMORY: Stores compressed summaries of conversations
 * - Enables long-term memory across sessions
 * - Preserves key insights from old conversations
 * - Reduces context window usage
 */

const conversationSummarySchema = new mongoose.Schema(
  {
    // Link to conversation
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    // Summary content
    summary: {
      type: String,
      required: true,
    },

    // Key topics discussed
    topics: [
      {
        type: String,
      },
    ],

    // Key facts/insights extracted
    keyInsights: [
      {
        type: String,
      },
    ],

    // Entities mentioned in conversation
    mentionedEntities: [
      {
        entityId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Entity',
        },
        name: String,
        mentionCount: { type: Number, default: 1 },
      },
    ],

    // User preferences/patterns learned
    userPreferences: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },

    // Coverage information
    messagesCovered: {
      from: { type: Number, default: 0 },
      to: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    // Time range covered
    timeRange: {
      start: Date,
      end: Date,
    },

    // Quality metrics
    quality: {
      coherence: { type: Number, min: 0, max: 1 },
      completeness: { type: Number, min: 0, max: 1 },
    },

    // Processing metadata
    model: {
      type: String,
      default: 'mistral:latest',
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
conversationSummarySchema.index({ conversationId: 1, 'messagesCovered.to': -1 });
conversationSummarySchema.index({ userId: 1, createdAt: -1 });
conversationSummarySchema.index({ topics: 1 });

/**
 * Get latest summary for a conversation
 */
conversationSummarySchema.statics.getLatest = function (conversationId) {
  return this.findOne({ conversationId }).sort({ 'messagesCovered.to': -1 });
};

/**
 * Get all summaries for a user
 */
conversationSummarySchema.statics.getForUser = function (userId, options = {}) {
  const { limit = 50, skip = 0 } = options;
  return this.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('conversationId summary topics keyInsights timeRange');
};

/**
 * Search summaries by topic
 */
conversationSummarySchema.statics.searchByTopic = function (userId, topic, options = {}) {
  const { limit = 20 } = options;
  return this.find({
    userId,
    topics: { $regex: new RegExp(topic, 'i') },
  })
    .sort({ updatedAt: -1 })
    .limit(limit);
};

/**
 * Get cross-conversation insights
 */
conversationSummarySchema.statics.getCrossConversationInsights = function (userId, workspaceId) {
  return this.aggregate([
    { $match: { userId, workspaceId } },
    { $unwind: '$topics' },
    {
      $group: {
        _id: '$topics',
        count: { $sum: 1 },
        conversations: { $addToSet: '$conversationId' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);
};

export const ConversationSummary = mongoose.model('ConversationSummary', conversationSummarySchema);

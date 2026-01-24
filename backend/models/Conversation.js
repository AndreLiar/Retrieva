/**
 * Conversation Model
 * Stores chat conversation metadata for RAG Q&A sessions
 * @module models/Conversation
 */

import mongoose from 'mongoose';

/**
 * @typedef {Object} ConversationDocument
 * @property {mongoose.Types.ObjectId} _id - Unique identifier
 * @property {string} title - Conversation title (default: 'New Conversation')
 * @property {string} userId - User ID or 'anonymous'
 * @property {Date} lastMessageAt - Timestamp of last message
 * @property {number} messageCount - Number of messages in conversation
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */

/**
 * @typedef {mongoose.Model<ConversationDocument>} ConversationModel
 */

const conversationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'New Conversation',
    },
    userId: {
      type: String,
      default: 'anonymous', // For now, until we add auth
      index: true,
    },
    workspaceId: {
      type: String,
      index: true,
      default: 'default', // Default workspace for entity memory
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient retrieval of user's conversations
conversationSchema.index({ userId: 1, updatedAt: -1 });

// Update lastMessageAt when conversation is modified
conversationSchema.pre('save', function () {
  this.lastMessageAt = new Date();
});

export const Conversation = mongoose.model('Conversation', conversationSchema);

/**
 * Conversation Model
 * Stores chat conversation metadata for RAG Q&A sessions
 * @module models/Conversation
 */

import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../services/tenantIsolation.js';

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
      type: mongoose.Schema.Types.Mixed, // Allow both String and ObjectId for flexibility
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
    // ISSUE #25 FIX: Metadata for idempotency key support
    metadata: {
      idempotencyKey: {
        type: String,
        sparse: true, // Only index when present
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient retrieval of user's conversations
conversationSchema.index({ userId: 1, updatedAt: -1 });

// SECURITY: Add compound index for tenant isolation queries
conversationSchema.index({ workspaceId: 1, userId: 1, updatedAt: -1 });

// ISSUE #25 FIX: Compound unique index for idempotency key lookups
// Ensures only one conversation per user+workspace+idempotencyKey combination
conversationSchema.index(
  { userId: 1, workspaceId: 1, 'metadata.idempotencyKey': 1 },
  { unique: true, sparse: true }
);

// Update lastMessageAt when conversation is modified
conversationSchema.pre('save', async function () {
  this.lastMessageAt = new Date();
});

// SECURITY: Apply database-level tenant isolation plugin
// This ensures all queries are automatically filtered by workspaceId
// Disabled in test environment to allow for simpler test setup
if (process.env.NODE_ENV !== 'test') {
  conversationSchema.plugin(tenantIsolationPlugin, {
    tenantField: 'workspaceId',
    enforceOnSave: true,
    auditLog: process.env.NODE_ENV !== 'production', // Only audit in non-production
  });
}

export const Conversation = mongoose.model('Conversation', conversationSchema);

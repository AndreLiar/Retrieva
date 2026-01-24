/**
 * Message Model
 * Stores conversation messages with automatic encryption for content
 * @module models/Message
 */

import mongoose from 'mongoose';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient retrieval of messages by conversation
messageSchema.index({ conversationId: 1, timestamp: 1 });

// Apply field-level encryption to message content
// Content is encrypted at rest and automatically decrypted on read
messageSchema.plugin(createEncryptionPlugin(['content']));

export const Message = mongoose.model('Message', messageSchema);

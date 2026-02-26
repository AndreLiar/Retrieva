/**
 * DocumentSource Model
 * Tracks synced documents from external sources (Notion, GDrive, etc.)
 * Note: Actual document content is stored in the vector store, not here
 * @module models/DocumentSource
 */

import mongoose from 'mongoose';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';

const documentSourceSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: [
        'notion',
        'gdrive',
        'confluence',
        'github',
        'jira',
        'slack',
        'pdf',
        'text',
        'custom',
        'url',
        'docx',
        'xlsx',
        'file',
      ],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    documentType: {
      type: String,
      enum: ['page', 'database', 'file', 'folder'],
      required: true,
    },
    // Document classification for access control and filtering
    // - public: Visible to all workspace members
    // - internal: Standard internal documents (default)
    // - confidential: Restricted to specific roles
    // - restricted: Highest sensitivity, limited access
    classification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal',
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    url: {
      type: String,
    },
    parentId: {
      type: String,
    },
    path: {
      type: String,
    },
    contentHash: {
      type: String,
    },
    lastModifiedInSource: {
      type: Date,
    },
    lastSyncedAt: {
      type: Date,
    },
    syncStatus: {
      type: String,
      enum: ['pending', 'synced', 'error', 'deleted'],
      default: 'pending',
      index: true,
    },
    vectorStoreIds: [
      {
        type: String,
      },
    ],
    chunkCount: {
      type: Number,
      default: 0,
    },
    // Phase 3: Embedding metadata for version tracking and migration
    embeddingMetadata: {
      version: String,
      provider: {
        type: String,
        enum: ['local', 'cloud'],
      },
      model: String,
      dimensions: Number,
      timestamp: Date,
      trustLevel: String,
      migratedAt: Date,
      migratedFrom: String,
    },
    // Store content for re-embedding during migration
    content: {
      type: String,
    },
    blocks: {
      type: mongoose.Schema.Types.Mixed,
    },
    metadata: {
      author: String,
      createdAt: Date,
      tags: [String],
      properties: mongoose.Schema.Types.Mixed,
      customFields: mongoose.Schema.Types.Mixed,
    },
    // ISSUE #24 FIX: Added size limits for DB hygiene
    errorLog: {
      type: [
        {
          timestamp: {
            type: Date,
            default: Date.now,
          },
          error: {
            type: String,
            maxlength: [2000, 'Error message cannot exceed 2000 characters'],
          },
          retryCount: Number,
        },
      ],
      validate: {
        validator: function (arr) {
          return arr.length <= 10;
        },
        message: 'Error log cannot exceed 10 entries',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate documents
documentSourceSchema.index({ workspaceId: 1, sourceId: 1 }, { unique: true });

// Index for efficient queries
documentSourceSchema.index({ sourceType: 1, syncStatus: 1 });
documentSourceSchema.index({ lastModifiedInSource: -1 });

// ISSUE #19 FIX: Compound index for workspace + sync status queries
// Used when finding documents needing sync within a specific workspace
documentSourceSchema.index({ workspaceId: 1, syncStatus: 1 });

// Phase 3: Index for embedding migration queries
documentSourceSchema.index({ 'embeddingMetadata.version': 1, syncStatus: 1 });

// ISSUE #24 FIX: Method to add error log entry with size limits
const MAX_ERROR_LENGTH = 2000;
const MAX_ERROR_LOG_ENTRIES = 10;

documentSourceSchema.methods.addError = function (error, retryCount = 0) {
  // Truncate error message to max length
  let errorMessage = error.toString();
  if (errorMessage.length > MAX_ERROR_LENGTH) {
    errorMessage = errorMessage.substring(0, MAX_ERROR_LENGTH - 3) + '...';
  }

  this.errorLog.push({
    timestamp: new Date(),
    error: errorMessage,
    retryCount,
  });

  // Keep only last N errors
  if (this.errorLog.length > MAX_ERROR_LOG_ENTRIES) {
    this.errorLog = this.errorLog.slice(-MAX_ERROR_LOG_ENTRIES);
  }

  this.syncStatus = 'error';
  return this.save();
};

// Method to update sync status
documentSourceSchema.methods.markAsSynced = function (
  vectorStoreIds = [],
  chunkCount = 0,
  embeddingMetadata = null
) {
  this.syncStatus = 'synced';
  this.lastSyncedAt = new Date();
  this.vectorStoreIds = vectorStoreIds;
  this.chunkCount = chunkCount;
  if (embeddingMetadata) {
    this.embeddingMetadata = embeddingMetadata;
  }
  return this.save();
};

// Phase 3: Method to store content for re-embedding
documentSourceSchema.methods.storeContentForMigration = function (content, blocks = null) {
  this.content = content;
  if (blocks) {
    this.blocks = blocks;
  }
  return this.save();
};

// Method to mark as deleted
documentSourceSchema.methods.markAsDeleted = function () {
  this.syncStatus = 'deleted';
  return this.save();
};

/**
 * Static method to find documents needing sync
 * @deprecated Use DocumentSourceRepository.findNeedingSync() instead
 */
documentSourceSchema.statics.findNeedingSync = function (workspaceId, lastSyncTime = null) {
  const query = {
    workspaceId,
    syncStatus: { $in: ['pending', 'error'] },
  };

  if (lastSyncTime) {
    query.$or = [{ lastModifiedInSource: { $gt: lastSyncTime } }, { lastSyncedAt: null }];
  }

  return this.find(query);
};

// Apply field-level encryption to document metadata
// Title is encrypted as it may contain sensitive document names
// Note: Actual document content is stored encrypted in the vector store
documentSourceSchema.plugin(createEncryptionPlugin(['title']));

export const DocumentSource = mongoose.model('DocumentSource', documentSourceSchema);

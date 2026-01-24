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
      enum: ['notion', 'gdrive', 'confluence', 'pdf', 'text'],
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
    metadata: {
      author: String,
      createdAt: Date,
      tags: [String],
      properties: mongoose.Schema.Types.Mixed,
      customFields: mongoose.Schema.Types.Mixed,
    },
    errorLog: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        error: String,
        retryCount: Number,
      },
    ],
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

// Method to add error log entry
documentSourceSchema.methods.addError = function (error, retryCount = 0) {
  this.errorLog.push({
    timestamp: new Date(),
    error: error.toString(),
    retryCount,
  });

  // Keep only last 10 errors
  if (this.errorLog.length > 10) {
    this.errorLog = this.errorLog.slice(-10);
  }

  this.syncStatus = 'error';
  return this.save();
};

// Method to update sync status
documentSourceSchema.methods.markAsSynced = function (vectorStoreIds = [], chunkCount = 0) {
  this.syncStatus = 'synced';
  this.lastSyncedAt = new Date();
  this.vectorStoreIds = vectorStoreIds;
  this.chunkCount = chunkCount;
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

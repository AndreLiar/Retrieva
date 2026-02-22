/**
 * DataSource Model
 * Represents a non-Notion data source (file upload, URL, or Confluence).
 * Tracks sync status and is the parent record for DocumentSource entries
 * created by the dataSourceSyncWorker.
 */

import mongoose from 'mongoose';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';

const dataSourceSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },

    sourceType: {
      type: String,
      enum: ['file', 'url', 'confluence'],
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'syncing', 'active', 'error'],
      default: 'pending',
      index: true,
    },

    /**
     * Type-specific non-secret configuration:
     *   file:       { fileName, fileType, fileSize, parsedText }
     *   url:        { url }
     *   confluence: { baseUrl, spaceKey, email }
     * parsedText is removed after indexing to free space.
     */
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * Confluence API token — encrypted at rest via fieldEncryption plugin.
     * Top-level (not nested in config) so the encryption plugin works correctly.
     */
    apiToken: {
      type: String,
    },

    /**
     * DigitalOcean Spaces object key for the original uploaded file.
     * Present only for sourceType='file'. Allows re-indexing without re-upload.
     * Example: workspaces/ws-123/datasources/abc/report.pdf
     */
    storageKey: {
      type: String,
    },

    lastSyncedAt: { type: Date },
    lastSyncJobId: { type: String },

    stats: {
      totalDocuments: { type: Number, default: 0 },
      documentsIndexed: { type: Number, default: 0 },
      documentsSkipped: { type: Number, default: 0 },
      documentsErrored: { type: Number, default: 0 },
    },

    errorLog: {
      type: [
        {
          timestamp: { type: Date, default: Date.now },
          error: {
            type: String,
            maxlength: [2000, 'Error message cannot exceed 2000 characters'],
          },
        },
      ],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: 'Error log cannot exceed 10 entries',
      },
    },
  },
  { timestamps: true }
);

dataSourceSchema.index({ workspaceId: 1, sourceType: 1 });
dataSourceSchema.index({ workspaceId: 1, status: 1 });

/** Append an error to the capped log and set status to 'error' */
dataSourceSchema.methods.addError = function (error) {
  const msg = typeof error === 'string' ? error : error?.message || String(error);
  const truncated = msg.length > 2000 ? msg.substring(0, 1997) + '...' : msg;

  this.errorLog.push({ timestamp: new Date(), error: truncated });
  if (this.errorLog.length > 10) {
    this.errorLog = this.errorLog.slice(-10);
  }

  this.status = 'error';
  return this.save();
};

/** Mark sync as started */
dataSourceSchema.methods.markSyncing = function (jobId) {
  this.status = 'syncing';
  this.lastSyncJobId = jobId;
  return this.save();
};

/** Mark sync as completed with final stats */
dataSourceSchema.methods.markSynced = function (stats = {}) {
  this.status = 'active';
  this.lastSyncedAt = new Date();
  if (stats.totalDocuments !== undefined) this.stats.totalDocuments = stats.totalDocuments;
  if (stats.documentsIndexed !== undefined) this.stats.documentsIndexed = stats.documentsIndexed;
  if (stats.documentsSkipped !== undefined) this.stats.documentsSkipped = stats.documentsSkipped;
  if (stats.documentsErrored !== undefined) this.stats.documentsErrored = stats.documentsErrored;
  return this.save();
};

// Encrypt apiToken at rest (used for Confluence API token)
dataSourceSchema.plugin(createEncryptionPlugin(['apiToken']));

export const DataSource = mongoose.model('DataSource', dataSourceSchema);
export default DataSource;

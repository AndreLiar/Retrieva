/**
 * MCPDataSource Model
 * Registry of external data sources connected via the Model Context Protocol (MCP).
 * Each record represents one MCP server endpoint that exposes documents for indexing.
 *
 * Role in the pipeline:
 *   MCPDataSource (connection config)
 *     → MCPDataSourceAdapter (MCP client, fetches docs)
 *       → documentIndexQueue (BullMQ)
 *         → documentIndexWorker (chunks + embeds into Qdrant)
 */

import mongoose from 'mongoose';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';

const mcpDataSourceSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    /** Human-readable label shown in the UI, e.g. "Confluence - Engineering Wiki" */
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },

    /**
     * The semantic type of content this MCP server exposes.
     * Stored on DocumentSource records and in Qdrant chunk metadata so that
     * filters and citations show the correct source type.
     */
    sourceType: {
      type: String,
      enum: ['confluence', 'gdrive', 'github', 'jira', 'slack', 'custom'],
      required: true,
    },

    /**
     * Full HTTP URL of the MCP server's StreamableHTTP endpoint.
     * Example: https://mcp.company.internal/confluence
     */
    serverUrl: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Bearer token used to authenticate requests to the MCP server.
     * Encrypted at rest via fieldEncryption plugin (AES-GCM).
     */
    authToken: {
      type: String,
    },

    syncStatus: {
      type: String,
      enum: ['active', 'syncing', 'error', 'paused', 'pending'],
      default: 'pending',
      index: true,
    },

    syncSettings: {
      autoSync: { type: Boolean, default: false },
      syncIntervalHours: { type: Number, default: 24, min: 1, max: 168 },
    },

    lastSyncedAt: { type: Date },
    lastSyncJobId: { type: String },

    stats: {
      totalDocuments: { type: Number, default: 0 },
      lastSyncDurationMs: { type: Number },
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

// One workspace can have multiple MCP sources, but each server URL must be unique per workspace
mcpDataSourceSchema.index({ workspaceId: 1, serverUrl: 1 }, { unique: true });
mcpDataSourceSchema.index({ workspaceId: 1, syncStatus: 1 });

/** Append an error to the capped log */
mcpDataSourceSchema.methods.addError = function (error) {
  const msg = typeof error === 'string' ? error : error?.message || String(error);
  const truncated = msg.length > 2000 ? msg.substring(0, 1997) + '...' : msg;

  this.errorLog.push({ timestamp: new Date(), error: truncated });
  if (this.errorLog.length > 10) {
    this.errorLog = this.errorLog.slice(-10);
  }

  this.syncStatus = 'error';
  return this.save();
};

/** Mark sync as started */
mcpDataSourceSchema.methods.markSyncing = function (jobId) {
  this.syncStatus = 'syncing';
  this.lastSyncJobId = jobId;
  return this.save();
};

/** Mark sync as completed with final stats */
mcpDataSourceSchema.methods.markSynced = function (stats = {}) {
  this.syncStatus = 'active';
  this.lastSyncedAt = new Date();
  if (stats.totalDocuments !== undefined) this.stats.totalDocuments = stats.totalDocuments;
  if (stats.documentsIndexed !== undefined) this.stats.documentsIndexed = stats.documentsIndexed;
  if (stats.documentsSkipped !== undefined) this.stats.documentsSkipped = stats.documentsSkipped;
  if (stats.documentsErrored !== undefined) this.stats.documentsErrored = stats.documentsErrored;
  if (stats.durationMs !== undefined) this.stats.lastSyncDurationMs = stats.durationMs;
  return this.save();
};

// Encrypt the authToken at rest
mcpDataSourceSchema.plugin(createEncryptionPlugin(['authToken']));

export const MCPDataSource = mongoose.model('MCPDataSource', mcpDataSourceSchema);
export default MCPDataSource;

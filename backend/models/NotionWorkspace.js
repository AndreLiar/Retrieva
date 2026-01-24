import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/security/encryption.js';

const notionWorkspaceSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      unique: true,
    },
    workspaceName: {
      type: String,
    },
    workspaceIcon: {
      type: String,
    },
    accessToken: {
      type: String,
      required: true,
    },
    botId: {
      type: String,
    },
    owner: {
      type: {
        type: String,
      },
      user: mongoose.Schema.Types.Mixed,
    },
    syncScope: {
      type: String,
      enum: ['all', 'specific_pages', 'databases_only'],
      default: 'all',
    },
    includedPages: [
      {
        type: String,
      },
    ],
    excludedPages: [
      {
        type: String,
      },
    ],
    lastSyncAt: {
      type: Date,
    },
    lastSuccessfulSyncAt: {
      type: Date,
    },
    syncStatus: {
      type: String,
      enum: ['active', 'syncing', 'error', 'paused'],
      default: 'active',
      index: true,
    },
    syncSettings: {
      autoSync: {
        type: Boolean,
        default: true,
      },
      syncIntervalHours: {
        type: Number,
        default: 6,
      },
      lastSyncJobId: String,
    },
    stats: {
      totalPages: {
        type: Number,
        default: 0,
      },
      totalDatabases: {
        type: Number,
        default: 0,
      },
      totalDocuments: {
        type: Number,
        default: 0,
      },
      lastSyncDuration: Number,
      errorCount: {
        type: Number,
        default: 0,
      },
    },
    metadata: {
      createdBy: String,
      tags: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notionWorkspaceSchema.index({ userId: 1, syncStatus: 1 });

// Encrypt access token before saving
notionWorkspaceSchema.pre('save', function () {
  if (this.isModified('accessToken') && this.accessToken) {
    // Only encrypt if not already encrypted (check for ':' separator)
    if (!this.accessToken.includes(':')) {
      this.accessToken = encrypt(this.accessToken);
    }
  }
});

// Method to get decrypted access token
notionWorkspaceSchema.methods.getDecryptedToken = function () {
  return decrypt(this.accessToken);
};

// Method to update sync statistics
notionWorkspaceSchema.methods.updateStats = function (stats) {
  this.stats = {
    ...this.stats,
    ...stats,
  };
  return this.save();
};

// Method to update sync status
notionWorkspaceSchema.methods.updateSyncStatus = function (status, jobId = null) {
  this.syncStatus = status;
  if (jobId) {
    this.syncSettings.lastSyncJobId = jobId;
  }
  if (status === 'syncing') {
    this.lastSyncAt = new Date();
  }
  return this.save();
};

export const NotionWorkspace = mongoose.model('NotionWorkspace', notionWorkspaceSchema);

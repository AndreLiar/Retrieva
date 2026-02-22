import mongoose from 'mongoose';
import {
  encrypt,
  decrypt,
  rotateEncryption,
  getEncryptionVersion,
  getCurrentKeyVersion,
  needsKeyRotation,
} from '../utils/security/encryption.js';

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
    // Key rotation support (ISSUE #7)
    // Tracks which encryption key version was used
    // Allows easy querying for tokens needing rotation
    tokenEncryptionVersion: {
      type: Number,
      default: 1,
      index: true,
    },
    tokenLastRotatedAt: {
      type: Date,
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
    // Phase 2: Trust level for hybrid embedding system
    // Determines whether cloud embeddings can be used
    trustLevel: {
      type: String,
      enum: ['public', 'internal', 'regulated'],
      default: 'internal',
      index: true,
    },
    // User-declared data type (Option 1)
    dataClassification: {
      declaredType: {
        type: String,
        enum: ['personal_notes', 'team_docs', 'company_confidential', 'regulated_data', 'not_set'],
        default: 'not_set',
      },
      declaredAt: Date,
      declaredBy: String, // userId who made the declaration
      description: String, // User's description of data type
    },
    // Embedding preferences
    embeddingSettings: {
      preferCloud: {
        type: Boolean,
        default: false, // Default to local for privacy
      },
      cloudConsent: {
        type: Boolean,
        default: false, // User must explicitly consent
      },
      cloudConsentDate: Date,
      fallbackToCloud: {
        type: Boolean,
        default: true, // Allow cloud fallback for failures
      },
      // PII Detection tracking (Option 2 - auto-detection)
      lastPiiScan: Date,
      piiDetected: {
        type: Boolean,
        default: false,
      },
      detectedPatterns: [String], // Names of detected patterns
      autoUpgraded: {
        type: Boolean,
        default: false, // True if trust level was auto-upgraded
      },
      autoUpgradedAt: Date,
      autoUpgradedFrom: String, // Previous trust level before upgrade
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
      enum: ['active', 'syncing', 'error', 'paused', 'token_expired'],
      default: 'active',
      index: true,
    },
    // Token health monitoring fields
    tokenStatus: {
      type: String,
      enum: ['valid', 'expired', 'invalid', 'revoked', 'unknown'],
      default: 'unknown',
    },
    tokenLastValidated: {
      type: Date,
    },
    tokenInvalidatedAt: {
      type: Date,
    },
    tokenValidationErrors: {
      type: Number,
      default: 0,
    },
    lastTokenExpirationNotice: {
      type: Date,
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
    // Optional link to an Organization (Phase 2a)
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notionWorkspaceSchema.index({ userId: 1, syncStatus: 1 });

// Encrypt access token before saving
notionWorkspaceSchema.pre('save', async function () {
  if (this.isModified('accessToken') && this.accessToken) {
    // Only encrypt if not already encrypted
    // New format: v{n}:iv:authTag:encrypted
    // Legacy format: iv:authTag:encrypted (no 'v' prefix)
    const isAlreadyEncrypted =
      this.accessToken.includes(':') &&
      (this.accessToken.startsWith('v') || this.accessToken.split(':').length === 3);

    if (!isAlreadyEncrypted) {
      this.accessToken = encrypt(this.accessToken);
      this.tokenEncryptionVersion = getCurrentKeyVersion();
    }
  }
});

// Method to get decrypted access token
notionWorkspaceSchema.methods.getDecryptedToken = function () {
  return decrypt(this.accessToken);
};

// Method to check if token needs key rotation
notionWorkspaceSchema.methods.needsKeyRotation = function () {
  return needsKeyRotation(this.accessToken);
};

// Method to get current encryption version of the token
notionWorkspaceSchema.methods.getTokenEncryptionVersion = function () {
  return getEncryptionVersion(this.accessToken);
};

/**
 * Rotate the access token to use the current encryption key
 * Use this during key rotation to upgrade tokens to new key version
 *
 * @returns {Promise<Object>} Updated workspace
 */
notionWorkspaceSchema.methods.rotateToken = async function () {
  const oldVersion = getEncryptionVersion(this.accessToken);
  const currentVersion = getCurrentKeyVersion();

  if (oldVersion >= currentVersion) {
    // Already using current key version
    return { rotated: false, version: oldVersion };
  }

  // Re-encrypt with current key
  this.accessToken = rotateEncryption(this.accessToken);
  this.tokenEncryptionVersion = currentVersion;
  this.tokenLastRotatedAt = new Date();

  await this.save();

  return {
    rotated: true,
    oldVersion,
    newVersion: currentVersion,
  };
};

/**
 * Static method to find all workspaces needing key rotation
 * @returns {Promise<Array>} Workspaces with old encryption versions
 */
notionWorkspaceSchema.statics.findNeedingRotation = function () {
  const currentVersion = getCurrentKeyVersion();
  return this.find({
    $or: [
      { tokenEncryptionVersion: { $lt: currentVersion } },
      { tokenEncryptionVersion: { $exists: false } },
    ],
  });
};

/**
 * Static method to rotate all tokens to current key version
 * @returns {Promise<Object>} Rotation results
 */
notionWorkspaceSchema.statics.rotateAllTokens = async function () {
  const workspaces = await this.findNeedingRotation();
  const results = {
    total: workspaces.length,
    rotated: 0,
    failed: 0,
    errors: [],
  };

  for (const workspace of workspaces) {
    try {
      const result = await workspace.rotateToken();
      if (result.rotated) {
        results.rotated++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        workspaceId: workspace.workspaceId,
        error: error.message,
      });
    }
  }

  return results;
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

/**
 * Document Version Model
 *
 * M1 RAW MEMORY: Tracks document changes over time
 * - Stores version history for documents
 * - Enables rollback to previous versions
 * - Tracks content changes and diffs
 *
 * @module models/DocumentVersion
 */

import mongoose from 'mongoose';

const documentVersionSchema = new mongoose.Schema(
  {
    documentSourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentSource',
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    contentHash: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    changeType: {
      type: String,
      enum: ['created', 'updated', 'restored'],
      default: 'updated',
    },
    changeSummary: {
      type: String,
    },
    metadata: {
      wordCount: Number,
      characterCount: Number,
      chunkCount: Number,
      vectorStoreIds: [String],
    },
    diff: {
      addedLines: { type: Number, default: 0 },
      removedLines: { type: Number, default: 0 },
      modifiedSections: [String],
    },
    sourceMetadata: {
      lastModifiedInSource: Date,
      author: String,
      sourceVersion: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient version queries
documentVersionSchema.index({ documentSourceId: 1, version: -1 });
documentVersionSchema.index({ workspaceId: 1, createdAt: -1 });
documentVersionSchema.index({ contentHash: 1 });

/**
 * Get latest version number for a document
 */
documentVersionSchema.statics.getLatestVersionNumber = async function (documentSourceId) {
  const latest = await this.findOne({ documentSourceId }).sort({ version: -1 }).select('version');
  return latest?.version || 0;
};

/**
 * Get version history for a document
 */
documentVersionSchema.statics.getVersionHistory = async function (documentSourceId, options = {}) {
  const { limit = 10, includeContent = false } = options;

  const projection = includeContent ? {} : { content: 0 };

  return this.find({ documentSourceId }).select(projection).sort({ version: -1 }).limit(limit);
};

/**
 * Find documents with content hash (deduplication)
 */
documentVersionSchema.statics.findByContentHash = async function (contentHash, workspaceId = null) {
  const query = { contentHash };
  if (workspaceId) query.workspaceId = workspaceId;

  return this.find(query)
    .select('documentSourceId version workspaceId')
    .populate('documentSourceId', 'title sourceType');
};

/**
 * Create a new version
 */
documentVersionSchema.statics.createVersion = async function (documentSourceId, data) {
  const latestVersion = await this.getLatestVersionNumber(documentSourceId);

  // Mark previous version as inactive
  if (latestVersion > 0) {
    await this.updateMany({ documentSourceId, isActive: true }, { isActive: false });
  }

  return this.create({
    ...data,
    documentSourceId,
    version: latestVersion + 1,
    isActive: true,
  });
};

/**
 * Get diff between two versions
 */
documentVersionSchema.statics.getVersionDiff = async function (
  documentSourceId,
  fromVersion,
  toVersion
) {
  const [fromDoc, toDoc] = await Promise.all([
    this.findOne({ documentSourceId, version: fromVersion }).select('content title'),
    this.findOne({ documentSourceId, version: toVersion }).select('content title'),
  ]);

  if (!fromDoc || !toDoc) {
    throw new Error('Version not found');
  }

  // Simple line-based diff
  const fromLines = fromDoc.content.split('\n');
  const toLines = toDoc.content.split('\n');

  const added = toLines.filter((line) => !fromLines.includes(line));
  const removed = fromLines.filter((line) => !toLines.includes(line));

  return {
    fromVersion,
    toVersion,
    titleChanged: fromDoc.title !== toDoc.title,
    addedLines: added.length,
    removedLines: removed.length,
    added: added.slice(0, 50), // Limit for display
    removed: removed.slice(0, 50),
  };
};

/**
 * Cleanup old versions (retention policy)
 */
documentVersionSchema.statics.cleanupOldVersions = async function (options = {}) {
  const { maxVersionsPerDocument = 10, maxAgeDays = 90, dryRun = false } = options;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // Find documents with too many versions
  const docsWithManyVersions = await this.aggregate([
    { $group: { _id: '$documentSourceId', count: { $sum: 1 } } },
    { $match: { count: { $gt: maxVersionsPerDocument } } },
  ]);

  let deleted = 0;

  for (const doc of docsWithManyVersions) {
    // Keep latest maxVersionsPerDocument versions
    const versionsToDelete = await this.find({ documentSourceId: doc._id })
      .sort({ version: -1 })
      .skip(maxVersionsPerDocument)
      .select('_id');

    if (!dryRun && versionsToDelete.length > 0) {
      const result = await this.deleteMany({
        _id: { $in: versionsToDelete.map((v) => v._id) },
      });
      deleted += result.deletedCount;
    }
  }

  // Delete very old non-active versions
  if (!dryRun) {
    const oldResult = await this.deleteMany({
      createdAt: { $lt: cutoffDate },
      isActive: false,
    });
    deleted += oldResult.deletedCount;
  }

  return { deleted, documentsProcessed: docsWithManyVersions.length };
};

export const DocumentVersion = mongoose.model('DocumentVersion', documentVersionSchema);

import mongoose from 'mongoose';

/**
 * DocumentSummary Model
 *
 * M3 COMPRESSED MEMORY: Stores condensed summaries of documents
 * - Enables faster context building for large documents
 * - Provides high-level overview before diving into chunks
 * - Links to extracted entities
 */

const documentSummarySchema = new mongoose.Schema(
  {
    // Link to source document
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

    // Document identification
    sourceId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },

    // Summary content
    summary: {
      type: String,
      required: true,
    },
    summaryLength: {
      type: Number,
      default: 0,
    },

    // Key points extracted from document
    keyPoints: [
      {
        type: String,
      },
    ],

    // Topics/themes identified
    topics: [
      {
        type: String,
      },
    ],

    // Summary metadata
    originalLength: {
      type: Number,
      default: 0,
    },
    compressionRatio: {
      type: Number,
      default: 0,
    },

    // Summary embedding for semantic search on summaries
    summaryEmbedding: {
      type: [Number],
      default: [],
    },

    // Links to extracted entities
    entityIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Entity',
      },
    ],

    // Quality metrics
    quality: {
      coherence: { type: Number, min: 0, max: 1 },
      coverage: { type: Number, min: 0, max: 1 },
      accuracy: { type: Number, min: 0, max: 1 },
    },

    // Processing metadata
    model: {
      type: String,
      default: 'mistral:latest',
    },
    processingTimeMs: {
      type: Number,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
documentSummarySchema.index({ workspaceId: 1, sourceId: 1 }, { unique: true });
documentSummarySchema.index({ topics: 1 });
documentSummarySchema.index({ createdAt: -1 });

/**
 * Static method to find summary by document source
 */
documentSummarySchema.statics.findBySourceId = function (workspaceId, sourceId) {
  return this.findOne({ workspaceId, sourceId });
};

/**
 * Static method to find summaries by topic
 */
documentSummarySchema.statics.findByTopic = function (workspaceId, topic) {
  return this.find({
    workspaceId,
    topics: { $regex: new RegExp(topic, 'i') },
  });
};

/**
 * Static method to get all summaries for workspace
 */
documentSummarySchema.statics.getWorkspaceSummaries = function (workspaceId, options = {}) {
  const { limit = 100, skip = 0 } = options;
  return this.find({ workspaceId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('title summary keyPoints topics compressionRatio');
};

/**
 * Update summary with new content
 */
documentSummarySchema.methods.updateSummary = function (summary, keyPoints, topics, metadata = {}) {
  this.summary = summary;
  this.summaryLength = summary.length;
  this.keyPoints = keyPoints;
  this.topics = topics;
  this.compressionRatio = metadata.originalLength
    ? 1 - summary.length / metadata.originalLength
    : this.compressionRatio;
  this.version += 1;
  return this.save();
};

export const DocumentSummary = mongoose.model('DocumentSummary', documentSummarySchema);

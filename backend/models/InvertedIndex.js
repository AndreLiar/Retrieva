/**
 * Inverted Index Model for Optimized BM25 Search
 *
 * Stores term → document postings for O(log N) sparse search
 * instead of O(N) full collection scan.
 *
 * @module models/InvertedIndex
 */

import mongoose from 'mongoose';

/**
 * Posting entry - represents a document containing the term
 */
const postingSchema = new mongoose.Schema(
  {
    vectorStoreId: { type: String, required: true },
    termFrequency: { type: Number, required: true },
    weight: { type: Number, required: true }, // Pre-computed BM25 weight
  },
  { _id: false }
);

/**
 * Inverted Index Schema
 * Each document represents one term in one workspace
 */
const invertedIndexSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    term: { type: String, required: true },
    postings: [postingSchema],
    documentFrequency: { type: Number, required: true }, // Number of docs containing this term
  },
  {
    timestamps: true,
    // Optimize for read-heavy workloads
    collection: 'invertedindexes',
  }
);

// Compound index for fast term lookup within workspace
invertedIndexSchema.index({ workspaceId: 1, term: 1 }, { unique: true });

// Index for workspace-wide operations (rebuild, delete)
invertedIndexSchema.index({ workspaceId: 1 });

/**
 * Static method to get postings for multiple terms in one query
 * @param {string} workspaceId - Workspace ID
 * @param {string[]} terms - Array of terms to lookup
 * @returns {Promise<Map<string, Object>>} Map of term -> postings data
 */
invertedIndexSchema.statics.getPostingsForTerms = async function (workspaceId, terms) {
  const results = await this.find({
    workspaceId,
    term: { $in: terms },
  }).lean();

  const postingsMap = new Map();
  for (const entry of results) {
    postingsMap.set(entry.term, {
      postings: entry.postings,
      documentFrequency: entry.documentFrequency,
    });
  }

  return postingsMap;
};

/**
 * Static method to remove a document from all postings
 * @param {string} workspaceId - Workspace ID
 * @param {string} vectorStoreId - Document's vector store ID
 */
invertedIndexSchema.statics.removeDocument = async function (workspaceId, vectorStoreId) {
  await this.updateMany(
    { workspaceId },
    {
      $pull: { postings: { vectorStoreId } },
    }
  );

  // Update document frequencies and remove empty entries
  await this.deleteMany({
    workspaceId,
    postings: { $size: 0 },
  });
};

const InvertedIndex =
  mongoose.models.InvertedIndex || mongoose.model('InvertedIndex', invertedIndexSchema);

export default InvertedIndex;
export { InvertedIndex };

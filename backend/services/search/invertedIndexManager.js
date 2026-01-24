/**
 * Inverted Index Manager for Optimized BM25 Search
 *
 * Provides O(log N) sparse search using inverted index
 * instead of O(N) full collection scan.
 *
 * @module services/search/invertedIndexManager
 */

import InvertedIndex from '../../models/InvertedIndex.js';
import logger from '../../config/logger.js';

/**
 * Inverted Index Manager
 * Handles building, updating, and searching the inverted index
 */
class InvertedIndexManager {
  /**
   * @param {Object} sparseVectorManager - Reference to SparseVectorManager for vocabulary access
   */
  constructor(sparseVectorManager) {
    this.sparseVectorManager = sparseVectorManager;
  }

  /**
   * Build inverted index from existing sparse vectors
   * This is used for migration of existing data
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Function} getSparseVectors - Function to get sparse vectors
   * @returns {Promise<Object>} Build statistics
   */
  async buildInvertedIndex(workspaceId, getSparseVectors) {
    const startTime = Date.now();

    // Clear existing inverted index for this workspace
    await InvertedIndex.deleteMany({ workspaceId });

    // Load vocabulary for term weights
    const vocab = await this.sparseVectorManager._loadVocabulary(workspaceId);

    if (vocab.size === 0) {
      logger.warn('Cannot build inverted index: vocabulary is empty', {
        service: 'inverted-index',
        workspaceId,
      });
      return { indexed: 0, terms: 0 };
    }

    // Get all sparse vectors for workspace
    const sparseVectors = await getSparseVectors();

    // Build inverted index in memory first
    const invertedMap = new Map(); // term -> { postings: [], df: 0 }

    for (const doc of sparseVectors) {
      for (const { termIndex, weight } of doc.vector) {
        // Find term by index
        let termName = null;
        for (const [term, data] of vocab) {
          if (data.index === termIndex) {
            termName = term;
            break;
          }
        }

        if (!termName) continue;

        if (!invertedMap.has(termName)) {
          invertedMap.set(termName, { postings: [], df: 0 });
        }

        const entry = invertedMap.get(termName);
        entry.postings.push({
          vectorStoreId: doc.vectorStoreId,
          termFrequency: 1, // Simplified - actual TF is embedded in weight
          weight,
        });
        entry.df++;
      }
    }

    // Bulk insert to MongoDB
    const bulkOps = [];
    for (const [term, data] of invertedMap) {
      bulkOps.push({
        updateOne: {
          filter: { workspaceId, term },
          update: {
            $set: {
              postings: data.postings,
              documentFrequency: data.df,
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      // Process in batches of 1000 to avoid memory issues
      const batchSize = 1000;
      for (let i = 0; i < bulkOps.length; i += batchSize) {
        const batch = bulkOps.slice(i, i + batchSize);
        await InvertedIndex.bulkWrite(batch, { ordered: false });
      }
    }

    logger.info('Built inverted index for workspace', {
      service: 'inverted-index',
      workspaceId,
      documents: sparseVectors.length,
      terms: invertedMap.size,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      indexed: sparseVectors.length,
      terms: invertedMap.size,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Update inverted index when a document is indexed
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} vectorStoreId - Document's vector store ID
   * @param {Array<{termIndex: number, weight: number}>} vector - Sparse vector
   * @returns {Promise<void>}
   */
  async updateInvertedIndex(workspaceId, vectorStoreId, vector) {
    if (!vector || vector.length === 0) return;

    const vocab = await this.sparseVectorManager._loadVocabulary(workspaceId);

    // Build reverse lookup: termIndex -> term
    const indexToTerm = this._buildIndexToTermMap(vocab);

    // First, remove this document from any existing postings
    await InvertedIndex.updateMany(
      { workspaceId, 'postings.vectorStoreId': vectorStoreId },
      { $pull: { postings: { vectorStoreId } } }
    );

    // Prepare bulk operations to add/update postings
    const bulkOps = [];
    for (const { termIndex, weight } of vector) {
      const term = indexToTerm.get(termIndex);
      if (!term) continue;

      bulkOps.push({
        updateOne: {
          filter: { workspaceId, term },
          update: {
            $push: {
              postings: {
                vectorStoreId,
                termFrequency: 1,
                weight,
              },
            },
            $inc: { documentFrequency: 0 }, // Will be recalculated
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      await InvertedIndex.bulkWrite(bulkOps, { ordered: false });

      // Update document frequencies
      const terms = vector.map((v) => indexToTerm.get(v.termIndex)).filter(Boolean);
      await this._updateDocumentFrequencies(workspaceId, terms);
    }
  }

  /**
   * Batch update inverted index for multiple documents
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Array<{vectorStoreId: string, vector: Array}>} documents - Documents with sparse vectors
   * @returns {Promise<number>} Number of documents processed
   */
  async batchUpdateInvertedIndex(workspaceId, documents) {
    const startTime = Date.now();
    const vocab = await this.sparseVectorManager._loadVocabulary(workspaceId);

    // Build reverse lookup: termIndex -> term
    const indexToTerm = this._buildIndexToTermMap(vocab);

    // Collect all term -> document mappings
    const termPostings = new Map(); // term -> [{vectorStoreId, weight}]

    for (const doc of documents) {
      if (!doc.vector || doc.vector.length === 0) continue;

      for (const { termIndex, weight } of doc.vector) {
        const term = indexToTerm.get(termIndex);
        if (!term) continue;

        if (!termPostings.has(term)) {
          termPostings.set(term, []);
        }
        termPostings.get(term).push({
          vectorStoreId: doc.vectorStoreId,
          termFrequency: 1,
          weight,
        });
      }
    }

    // Remove existing postings for these documents
    const vectorStoreIds = documents.map((d) => d.vectorStoreId);
    await InvertedIndex.updateMany(
      { workspaceId, 'postings.vectorStoreId': { $in: vectorStoreIds } },
      { $pull: { postings: { vectorStoreId: { $in: vectorStoreIds } } } }
    );

    // Bulk upsert new postings
    const bulkOps = [];
    for (const [term, newPostings] of termPostings) {
      bulkOps.push({
        updateOne: {
          filter: { workspaceId, term },
          update: {
            $push: { postings: { $each: newPostings } },
            $set: { documentFrequency: 0 }, // Will be updated
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < bulkOps.length; i += batchSize) {
        const batch = bulkOps.slice(i, i + batchSize);
        await InvertedIndex.bulkWrite(batch, { ordered: false });
      }
    }

    // Update document frequencies in bulk
    const termsToUpdate = Array.from(termPostings.keys());
    await InvertedIndex.updateMany({ workspaceId, term: { $in: termsToUpdate } }, [
      { $set: { documentFrequency: { $size: '$postings' } } },
    ]);

    logger.debug('Batch updated inverted index', {
      service: 'inverted-index',
      workspaceId,
      documents: documents.length,
      terms: termPostings.size,
      processingTimeMs: Date.now() - startTime,
    });

    return documents.length;
  }

  /**
   * Optimized sparse search using inverted index
   * Only scores documents that contain at least one query term
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Ranked results
   */
  async searchSparseOptimized(workspaceId, query, options = {}) {
    const { limit = 20 } = options;
    const startTime = Date.now();

    // Tokenize query using sparseVectorManager's tokenizer
    const queryTerms = this.sparseVectorManager._tokenize(query);
    if (queryTerms.length === 0) {
      return [];
    }

    // Load vocabulary for IDF values
    const vocab = await this.sparseVectorManager._loadVocabulary(workspaceId);

    // Get postings for all query terms from inverted index
    const postingsMap = await InvertedIndex.getPostingsForTerms(workspaceId, queryTerms);

    if (postingsMap.size === 0) {
      logger.debug('No matching terms found in inverted index', {
        service: 'inverted-index',
        workspaceId,
        queryTerms: queryTerms.length,
      });
      return [];
    }

    // Compute query term weights (BM25 for query)
    const queryTf = this.sparseVectorManager._getTermFrequency(queryTerms);
    const queryWeights = new Map();

    for (const [term] of queryTf) {
      const vocabEntry = vocab.get(term);
      if (!vocabEntry) continue;

      const { idf } = vocabEntry;
      // Simplified query weight: just use IDF (query is short)
      queryWeights.set(term, idf);
    }

    // Score documents that appear in postings
    const docScores = new Map(); // vectorStoreId -> score

    for (const [term, weight] of queryWeights) {
      const termData = postingsMap.get(term);
      if (!termData) continue;

      for (const posting of termData.postings) {
        const currentScore = docScores.get(posting.vectorStoreId) || 0;
        // Score = query_weight * doc_weight (pre-computed BM25)
        docScores.set(posting.vectorStoreId, currentScore + weight * posting.weight);
      }
    }

    // Sort and return top K
    const scored = Array.from(docScores.entries())
      .map(([vectorStoreId, score]) => ({ vectorStoreId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    logger.debug('Optimized sparse search completed', {
      service: 'inverted-index',
      workspaceId,
      queryTerms: queryTerms.length,
      matchingTerms: postingsMap.size,
      documentsScored: docScores.size,
      topScore: scored[0]?.score?.toFixed(4),
      processingTimeMs: Date.now() - startTime,
    });

    return scored;
  }

  /**
   * Get inverted index statistics
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Index statistics
   */
  async getInvertedIndexStats(workspaceId) {
    const [termCount, sampleTerms] = await Promise.all([
      InvertedIndex.countDocuments({ workspaceId }),
      InvertedIndex.find({ workspaceId })
        .sort({ documentFrequency: -1 })
        .limit(10)
        .select('term documentFrequency')
        .lean(),
    ]);

    const totalPostings = await InvertedIndex.aggregate([
      { $match: { workspaceId } },
      { $group: { _id: null, total: { $sum: { $size: '$postings' } } } },
    ]);

    return {
      termCount,
      totalPostings: totalPostings[0]?.total || 0,
      topTerms: sampleTerms.map((t) => ({ term: t.term, df: t.documentFrequency })),
    };
  }

  /**
   * Remove document from inverted index
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} vectorStoreId - Document's vector store ID
   */
  async removeFromInvertedIndex(workspaceId, vectorStoreId) {
    await InvertedIndex.removeDocument(workspaceId, vectorStoreId);

    logger.debug('Removed document from inverted index', {
      service: 'inverted-index',
      workspaceId,
      vectorStoreId,
    });
  }

  /**
   * Build reverse lookup map: termIndex -> term
   * @private
   */
  _buildIndexToTermMap(vocab) {
    const indexToTerm = new Map();
    for (const [term, data] of vocab) {
      indexToTerm.set(data.index, term);
    }
    return indexToTerm;
  }

  /**
   * Update document frequencies for specific terms
   * @private
   */
  async _updateDocumentFrequencies(workspaceId, terms) {
    for (const term of terms) {
      const entry = await InvertedIndex.findOne({ workspaceId, term });
      if (entry) {
        entry.documentFrequency = entry.postings.length;
        await entry.save();
      }
    }
  }
}

export default InvertedIndexManager;
export { InvertedIndexManager };

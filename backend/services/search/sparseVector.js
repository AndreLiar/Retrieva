/**
 * Sparse Vector Service for Hybrid Search
 *
 * M2 INDEXED MEMORY: Pre-computed BM25 sparse vectors
 * - Build vocabulary and IDF scores
 * - Pre-compute sparse vectors for documents
 * - Enable efficient hybrid search (dense + sparse)
 *
 * @module services/search/sparseVector
 */

import mongoose from 'mongoose';
import logger from '../../config/logger.js';
import { guardrailsConfig } from '../../config/guardrails.js';
import InvertedIndexManager from './invertedIndexManager.js';

// BM25 parameters
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// Vocabulary schema for storing IDF values
const vocabularySchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    term: { type: String, required: true },
    termIndex: { type: Number, required: true }, // Stable index for sparse vector matching
    idf: { type: Number, required: true },
    documentFrequency: { type: Number, required: true },
  },
  { timestamps: true }
);

vocabularySchema.index({ workspaceId: 1, term: 1 }, { unique: true });
vocabularySchema.index({ workspaceId: 1, termIndex: 1 }); // For efficient loading

const Vocabulary = mongoose.models.Vocabulary || mongoose.model('Vocabulary', vocabularySchema);

// Sparse vector schema for storing pre-computed BM25 vectors
const sparseVectorSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    documentSourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentSource' },
    vectorStoreId: { type: String, required: true, index: true },
    vector: [
      {
        termIndex: Number,
        weight: Number,
      },
    ],
    docLength: { type: Number, required: true },
    metadata: {
      title: String,
      contentHash: String,
      sourceId: String, // For matching with dense results in hybrid search
    },
  },
  { timestamps: true }
);

sparseVectorSchema.index({ workspaceId: 1, vectorStoreId: 1 }, { unique: true });

const SparseVector =
  mongoose.models.SparseVector || mongoose.model('SparseVector', sparseVectorSchema);

// Workspace statistics for average doc length
const workspaceStatsSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, unique: true },
    avgDocLength: { type: Number, default: 800 },
    totalDocuments: { type: Number, default: 0 },
    vocabularySize: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const WorkspaceStats =
  mongoose.models.WorkspaceStats || mongoose.model('WorkspaceStats', workspaceStatsSchema);

/**
 * Sparse Vector Manager
 * Core BM25 sparse vector functionality for hybrid search
 */
class SparseVectorManager {
  constructor() {
    this.vocabCache = new Map(); // workspaceId -> term -> { index, idf }
    this.statsCache = new Map(); // workspaceId -> stats
    this.invertedIndexManager = new InvertedIndexManager(this);
  }

  /**
   * Tokenize text into terms
   * @param {string} text - Text to tokenize
   * @returns {string[]} Array of terms
   */
  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1 && !this._isStopWord(term));
  }

  /**
   * Check if term is a stop word
   * @private
   */
  _isStopWord(term) {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'as',
      'if',
      'then',
      'than',
    ]);
    return stopWords.has(term);
  }

  /**
   * Get term frequency for a document
   * @param {string[]} terms - Array of terms
   * @returns {Map<string, number>} Term frequency map
   */
  _getTermFrequency(terms) {
    const tf = new Map();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }
    return tf;
  }

  /**
   * Build or update vocabulary from documents
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Array<{content: string, vectorStoreId: string}>} documents - Documents to process
   * @returns {Promise<Object>} Vocabulary stats
   */
  async buildVocabulary(workspaceId, documents) {
    const startTime = Date.now();

    // Calculate document frequencies
    const docFrequency = new Map();
    const totalDocs = documents.length;
    let totalLength = 0;

    for (const doc of documents) {
      const terms = this._tokenize(doc.content);
      totalLength += terms.length;

      // Unique terms in this document
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        docFrequency.set(term, (docFrequency.get(term) || 0) + 1);
      }
    }

    // Calculate IDF and build vocabulary
    const vocabOps = [];
    let termIndex = 0;
    const vocabMap = new Map();

    for (const [term, df] of docFrequency) {
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
      vocabMap.set(term, { index: termIndex, idf });

      vocabOps.push({
        updateOne: {
          filter: { workspaceId, term },
          update: { $set: { idf, documentFrequency: df, termIndex } }, // Store termIndex!
          upsert: true,
        },
      });
      termIndex++;
    }

    // Bulk upsert vocabulary
    if (vocabOps.length > 0) {
      await Vocabulary.bulkWrite(vocabOps, { ordered: false });
    }

    // Update workspace stats
    const avgDocLength = totalDocs > 0 ? totalLength / totalDocs : 800;
    await WorkspaceStats.findOneAndUpdate(
      { workspaceId },
      { $set: { avgDocLength, totalDocuments: totalDocs, vocabularySize: docFrequency.size } },
      { upsert: true }
    );

    // Update cache
    this.vocabCache.set(workspaceId, vocabMap);
    this.statsCache.set(workspaceId, { avgDocLength, totalDocuments: totalDocs });

    logger.info('Built vocabulary for workspace', {
      service: 'sparse-vector',
      workspaceId,
      vocabularySize: docFrequency.size,
      totalDocuments: totalDocs,
      avgDocLength: Math.round(avgDocLength),
      processingTimeMs: Date.now() - startTime,
    });

    return { vocabularySize: docFrequency.size, totalDocuments: totalDocs, avgDocLength };
  }

  /**
   * Load vocabulary into cache
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Map>} Vocabulary map
   */
  async _loadVocabulary(workspaceId) {
    if (this.vocabCache.has(workspaceId)) {
      return this.vocabCache.get(workspaceId);
    }

    const vocab = await Vocabulary.find({ workspaceId }).lean();
    const vocabMap = new Map();

    for (const entry of vocab) {
      // Use the stored termIndex for stable sparse vector matching
      vocabMap.set(entry.term, { index: entry.termIndex, idf: entry.idf });
    }

    this.vocabCache.set(workspaceId, vocabMap);
    return vocabMap;
  }

  /**
   * Load workspace stats
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Stats object
   */
  async _loadStats(workspaceId) {
    if (this.statsCache.has(workspaceId)) {
      return this.statsCache.get(workspaceId);
    }

    const stats = await WorkspaceStats.findOne({ workspaceId }).lean();
    const result = stats || { avgDocLength: 800, totalDocuments: 0 };

    this.statsCache.set(workspaceId, result);
    return result;
  }

  /**
   * Compute BM25 sparse vector for a document
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} content - Document content
   * @returns {Promise<Array<{termIndex: number, weight: number}>>}
   */
  async computeSparseVector(workspaceId, content) {
    const vocab = await this._loadVocabulary(workspaceId);
    const stats = await this._loadStats(workspaceId);

    const terms = this._tokenize(content);
    const tf = this._getTermFrequency(terms);
    const docLength = terms.length;

    const vector = [];

    for (const [term, freq] of tf) {
      const vocabEntry = vocab.get(term);
      if (!vocabEntry) continue;

      const { index, idf } = vocabEntry;

      // BM25 term weight
      const numerator = freq * (BM25_K1 + 1);
      const denominator = freq + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / stats.avgDocLength));
      const weight = idf * (numerator / denominator);

      if (weight > 0) {
        vector.push({ termIndex: index, weight });
      }
    }

    // Sort by term index for efficient storage/retrieval
    vector.sort((a, b) => a.termIndex - b.termIndex);

    return vector;
  }

  /**
   * Index document sparse vector
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} vectorStoreId - Vector store point ID
   * @param {string} content - Document content
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Object>} Indexed sparse vector
   */
  async indexDocument(workspaceId, vectorStoreId, content, metadata = {}) {
    const vector = await this.computeSparseVector(workspaceId, content);
    const terms = this._tokenize(content);

    const sparseVec = await SparseVector.findOneAndUpdate(
      { workspaceId, vectorStoreId },
      {
        $set: {
          vector,
          docLength: terms.length,
          documentSourceId: metadata.documentSourceId,
          metadata: { title: metadata.title, contentHash: metadata.contentHash },
        },
      },
      { upsert: true, new: true }
    );

    return sparseVec;
  }

  /**
   * Batch index documents
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Array} documents - Documents to index
   * @returns {Promise<number>} Number indexed
   */
  async batchIndexDocuments(workspaceId, documents) {
    const startTime = Date.now();
    let indexed = 0;

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      const ops = await Promise.all(
        batch.map(async (doc) => {
          const vector = await this.computeSparseVector(workspaceId, doc.content);
          const terms = this._tokenize(doc.content);

          return {
            updateOne: {
              filter: { workspaceId, vectorStoreId: doc.vectorStoreId },
              update: {
                $set: {
                  vector,
                  docLength: terms.length,
                  documentSourceId: doc.documentSourceId,
                  metadata: {
                    title: doc.title,
                    contentHash: doc.contentHash,
                    sourceId: doc.sourceId, // For matching with dense results
                  },
                },
              },
              upsert: true,
            },
          };
        })
      );

      if (ops.length > 0) {
        await SparseVector.bulkWrite(ops, { ordered: false });
        indexed += ops.length;
      }
    }

    logger.info('Batch indexed sparse vectors', {
      service: 'sparse-vector',
      workspaceId,
      indexed,
      processingTimeMs: Date.now() - startTime,
    });

    return indexed;
  }

  /**
   * Compute BM25 score between query and document
   *
   * @param {Array} queryVector - Query sparse vector
   * @param {Array} docVector - Document sparse vector
   * @returns {number} BM25 score
   */
  computeBM25Score(queryVector, docVector) {
    const docMap = new Map(docVector.map((v) => [v.termIndex, v.weight]));
    let score = 0;

    for (const { termIndex, weight } of queryVector) {
      const docWeight = docMap.get(termIndex);
      if (docWeight) {
        score += weight * docWeight;
      }
    }

    return score;
  }

  /**
   * Search using sparse vectors (BM25)
   * Uses optimized inverted index search if enabled via feature flag
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Ranked results
   */
  async searchSparse(workspaceId, query, options = {}) {
    const { limit = 20 } = options;
    const startTime = Date.now();
    const sparseConfig = guardrailsConfig.retrieval?.sparseSearch || {};

    // Use optimized inverted index search if enabled
    if (sparseConfig.useInvertedIndex) {
      try {
        const optimizedResults = await this.invertedIndexManager.searchSparseOptimized(
          workspaceId,
          query,
          options
        );

        logger.debug('Using optimized sparse search (inverted index)', {
          service: 'sparse-vector',
          workspaceId,
          resultsCount: optimizedResults.length,
          processingTimeMs: Date.now() - startTime,
        });

        return optimizedResults;
      } catch (error) {
        if (sparseConfig.fallbackOnError) {
          logger.warn('Inverted index search failed, falling back to full scan', {
            service: 'sparse-vector',
            workspaceId,
            error: error.message,
          });
        } else {
          throw error;
        }
      }
    }

    // Original full scan implementation (fallback)
    const queryVector = await this.computeSparseVector(workspaceId, query);

    if (queryVector.length === 0) {
      return [];
    }

    const docVectors = await SparseVector.find({ workspaceId })
      .select('vectorStoreId vector metadata')
      .lean();

    const scored = docVectors.map((doc) => ({
      vectorStoreId: doc.vectorStoreId,
      score: this.computeBM25Score(queryVector, doc.vector),
      metadata: doc.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    logger.debug('Sparse vector search completed (full scan)', {
      service: 'sparse-vector',
      workspaceId,
      queryTerms: queryVector.length,
      documentsScored: docVectors.length,
      topScore: results[0]?.score?.toFixed(4),
      processingTimeMs: Date.now() - startTime,
    });

    return results;
  }

  /**
   * Hybrid search combining dense and sparse results
   *
   * Uses a modified RRF (Reciprocal Rank Fusion) with sparse score boosting:
   * - Standard RRF for documents in both dense and sparse results
   * - Sparse-only documents with high BM25 scores get a relevance boost
   * - This ensures keyword-matched documents aren't buried by semantic-only results
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} query - Search query
   * @param {Array} denseResults - Results from dense retrieval
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Merged results with RRF scoring
   */
  async hybridSearch(workspaceId, query, denseResults, options = {}) {
    const { limit = 10, alpha = 0.5 } = options;
    const startTime = Date.now();

    const sparseResults = await this.searchSparse(workspaceId, query, { limit: limit * 2 });

    // Track max sparse score for normalization
    const maxSparseScore = sparseResults.length > 0 ? sparseResults[0].score : 1;

    // RRF scoring - use sourceId as the common key for matching
    const RRF_K = 60;
    const rrfScores = new Map();

    // Process dense results - use sourceId as the key
    denseResults.forEach((result, rank) => {
      const id = result.metadata?.sourceId || result.metadata?.vectorStoreId || `dense_${rank}`;
      if (!rrfScores.has(id)) {
        rrfScores.set(id, {
          denseRank: null,
          sparseRank: null,
          denseScore: null,
          sparseScore: null,
          doc: result,
          vectorStoreId: result.metadata?.vectorStoreId,
        });
      }
      const entry = rrfScores.get(id);
      if (!entry.denseRank || rank + 1 < entry.denseRank) {
        entry.denseRank = rank + 1;
        entry.denseScore = result.metadata?.score || 1 / (rank + 1);
        entry.doc = result;
      }
    });

    // Process sparse results - use sourceId as the key
    sparseResults.forEach((result, rank) => {
      const id = result.metadata?.sourceId || result.vectorStoreId;
      if (!rrfScores.has(id)) {
        rrfScores.set(id, {
          denseRank: null,
          sparseRank: null,
          denseScore: null,
          sparseScore: null,
          doc: null,
          vectorStoreId: result.vectorStoreId,
        });
      }
      const entry = rrfScores.get(id);
      if (!entry.sparseRank || rank + 1 < entry.sparseRank) {
        entry.sparseRank = rank + 1;
        entry.sparseScore = result.score;
        if (!entry.vectorStoreId) {
          entry.vectorStoreId = result.vectorStoreId;
        }
      }
    });

    // Calculate RRF scores with sparse relevance boosting
    const merged = [];
    for (const [id, entry] of rrfScores) {
      let rrfScore = 0;

      // Standard RRF contribution from dense results
      if (entry.denseRank) {
        rrfScore += alpha * (1 / (RRF_K + entry.denseRank));
      }

      // Sparse contribution with score-based boosting
      if (entry.sparseRank) {
        const baseSparseCont = (1 - alpha) * (1 / (RRF_K + entry.sparseRank));

        // Calculate normalized sparse score (0-1)
        const normalizedSparseScore = entry.sparseScore / maxSparseScore;

        // For sparse-only results with high BM25 scores, apply a relevance boost
        // This compensates for dense search missing highly relevant keyword matches
        if (!entry.denseRank && normalizedSparseScore >= 0.5) {
          // Boost factor: up to 2x for top sparse results
          // Scales from 1.0 (at 50% of max score) to 2.0 (at 100% of max score)
          const boostFactor = 1.0 + normalizedSparseScore;
          rrfScore += baseSparseCont * boostFactor;
        } else {
          rrfScore += baseSparseCont;
        }
      }

      merged.push({
        id,
        vectorStoreId: entry.vectorStoreId,
        rrfScore,
        denseRank: entry.denseRank,
        sparseRank: entry.sparseRank,
        denseScore: entry.denseScore,
        sparseScore: entry.sparseScore,
        normalizedSparseScore: entry.sparseScore ? (entry.sparseScore / maxSparseScore).toFixed(3) : null,
        doc: entry.doc,
      });
    }

    merged.sort((a, b) => b.rrfScore - a.rrfScore);

    // Debug logging
    const sparseOnlyWithVectorId = merged.filter(m => m.sparseRank && !m.denseRank && m.vectorStoreId);
    const sparseOnlyWithoutVectorId = merged.filter(m => m.sparseRank && !m.denseRank && !m.vectorStoreId);

    logger.info('Hybrid search completed', {
      service: 'sparse-vector',
      workspaceId,
      denseResults: denseResults.length,
      sparseResults: sparseResults.length,
      mergedResults: merged.length,
      maxSparseScore: maxSparseScore.toFixed(2),
      sparseOnlyWithVectorId: sparseOnlyWithVectorId.length,
      sparseOnlyWithoutVectorId: sparseOnlyWithoutVectorId.length,
      sparseOnlyCount: merged.filter((m) => m.sparseRank && !m.denseRank).length,
      topResult: {
        rrfScore: merged[0]?.rrfScore?.toFixed(4),
        denseRank: merged[0]?.denseRank,
        sparseRank: merged[0]?.sparseRank,
        normalizedSparseScore: merged[0]?.normalizedSparseScore,
      },
      processingTimeMs: Date.now() - startTime,
    });

    return merged.slice(0, limit);
  }

  /**
   * Get sparse vector statistics
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const [vocabCount, vectorCount, stats] = await Promise.all([
      Vocabulary.countDocuments({ workspaceId }),
      SparseVector.countDocuments({ workspaceId }),
      WorkspaceStats.findOne({ workspaceId }).lean(),
    ]);

    return {
      vocabularySize: vocabCount,
      indexedDocuments: vectorCount,
      avgDocLength: stats?.avgDocLength || 0,
      totalDocuments: stats?.totalDocuments || 0,
    };
  }

  // ============================================
  // INVERTED INDEX FACADE METHODS
  // Delegates to InvertedIndexManager for backward compatibility
  // ============================================

  async buildInvertedIndex(workspaceId) {
    return this.invertedIndexManager.buildInvertedIndex(workspaceId, () =>
      SparseVector.find({ workspaceId }).select('vectorStoreId vector docLength').lean()
    );
  }

  async updateInvertedIndex(workspaceId, vectorStoreId, vector) {
    return this.invertedIndexManager.updateInvertedIndex(workspaceId, vectorStoreId, vector);
  }

  async batchUpdateInvertedIndex(workspaceId, documents) {
    return this.invertedIndexManager.batchUpdateInvertedIndex(workspaceId, documents);
  }

  async searchSparseOptimized(workspaceId, query, options) {
    return this.invertedIndexManager.searchSparseOptimized(workspaceId, query, options);
  }

  async getInvertedIndexStats(workspaceId) {
    return this.invertedIndexManager.getInvertedIndexStats(workspaceId);
  }

  async removeFromInvertedIndex(workspaceId, vectorStoreId) {
    return this.invertedIndexManager.removeFromInvertedIndex(workspaceId, vectorStoreId);
  }

  /**
   * Rebuild vocabulary from Qdrant documents
   * Fetches all documents for a workspace from Qdrant and rebuilds vocabulary
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Vocabulary stats
   */
  async rebuildVocabularyFromQdrant(workspaceId) {
    const startTime = Date.now();
    logger.info('Rebuilding vocabulary from Qdrant', {
      service: 'sparse-vector',
      workspaceId,
    });

    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const collectionName = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

      const client = new QdrantClient({ url: qdrantUrl });

      // Fetch all documents for this workspace from Qdrant
      const documents = [];
      let offset = null;
      const batchSize = 100;

      do {
        const result = await client.scroll(collectionName, {
          filter: {
            must: [
              {
                key: 'metadata.workspaceId',
                match: { value: workspaceId },
              },
            ],
          },
          limit: batchSize,
          offset: offset,
          with_payload: true,
          with_vector: false,
        });

        for (const point of result.points) {
          const content = point.payload?.pageContent || point.payload?.content || '';
          if (content) {
            documents.push({
              content,
              vectorStoreId: point.id,
              // Include sourceId and title for hybrid search matching
              sourceId: point.payload?.metadata?.sourceId,
              title: point.payload?.metadata?.documentTitle,
            });
          }
        }

        offset = result.next_page_offset;
      } while (offset);

      if (documents.length === 0) {
        logger.warn('No documents found in Qdrant for vocabulary rebuild', {
          service: 'sparse-vector',
          workspaceId,
        });
        return { vocabularySize: 0, totalDocuments: 0, avgDocLength: 0 };
      }

      logger.info(`Fetched ${documents.length} documents from Qdrant`, {
        service: 'sparse-vector',
        workspaceId,
      });

      // Build vocabulary from fetched documents
      const result = await this.buildVocabulary(workspaceId, documents);

      // Now re-index all sparse vectors with the new vocabulary
      await this.batchIndexDocuments(workspaceId, documents);

      logger.info('Vocabulary rebuild complete', {
        service: 'sparse-vector',
        workspaceId,
        vocabularySize: result.vocabularySize,
        documentsReindexed: documents.length,
        processingTimeMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      logger.error('Failed to rebuild vocabulary from Qdrant', {
        service: 'sparse-vector',
        workspaceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clear cache for workspace
   */
  clearCache(workspaceId = null) {
    if (workspaceId) {
      this.vocabCache.delete(workspaceId);
      this.statsCache.delete(workspaceId);
    } else {
      this.vocabCache.clear();
      this.statsCache.clear();
    }
  }
}

// Singleton instance
export const sparseVectorManager = new SparseVectorManager();

// Export class and models for testing
export { SparseVectorManager, Vocabulary, SparseVector, WorkspaceStats };

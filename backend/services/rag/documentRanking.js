/**
 * Document ranking and scoring utilities for RAG
 * Includes BM25 keyword scoring and RRF hybrid re-ranking
 * @module services/rag/documentRanking
 */

import logger from '../../config/logger.js';

/**
 * @typedef {Object} DocumentMetadata
 * @property {number} [score] - Semantic similarity score
 * @property {string} [documentTitle] - Title of the source document
 * @property {string} [section] - Section within the document
 * @property {string} [source] - Document source URL or path
 * @property {string} [block_type] - Type of content block
 * @property {string[]} [heading_path] - Breadcrumb path of headings
 * @property {number} [positionPercent] - Position in document (0-100)
 */

/**
 * @typedef {Object} Document
 * @property {string} pageContent - The text content of the document
 * @property {DocumentMetadata} [metadata] - Document metadata
 */

/**
 * @typedef {Object} RankedDocument
 * @property {string} pageContent - The text content of the document
 * @property {DocumentMetadata} [metadata] - Document metadata
 * @property {number} score - Final ranking score (RRF or hybrid)
 * @property {number} [semanticScore] - Original semantic similarity score
 * @property {number} [keywordScore] - BM25 keyword score
 * @property {number} [semanticRank] - Rank by semantic score
 * @property {number} [bm25Rank] - Rank by BM25 score
 * @property {number} [rrfScore] - Reciprocal Rank Fusion score
 */

/**
 * @typedef {Object} RRFEntry
 * @property {Document} doc - The document
 * @property {number} rrfScore - Accumulated RRF score
 * @property {number|null} semanticRank - Rank in semantic ordering
 * @property {number|null} bm25Rank - Rank in BM25 ordering
 * @property {number|null} semanticScore - Semantic similarity score
 * @property {number|null} bm25Score - BM25 keyword score
 */

// BM25 parameters (based on research)
const BM25_K1 = 1.5; // Term frequency saturation
const BM25_B = 0.75; // Length normalization
const RRF_K = 60; // RRF constant (standard value from research)

/**
 * Calculate BM25 score for keyword matching
 * @param {string} query - Search query
 * @param {string} document - Document text
 * @param {number} avgDocLength - Average document length in corpus
 * @returns {number} - BM25 score
 */
export function calculateBM25Score(query, document, avgDocLength = 800) {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docTerms = document.toLowerCase().split(/\s+/);
  const docLength = docTerms.length;

  let score = 0;
  for (const term of queryTerms) {
    const termFreq = docTerms.filter((t) => t === term).length;
    if (termFreq > 0) {
      const idf = Math.log((1 + avgDocLength) / (termFreq + 0.5));
      const numerator = termFreq * (BM25_K1 + 1);
      const denominator = termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
      score += idf * (numerator / denominator);
    }
  }

  return score;
}

/**
 * Get unique document identifier from content
 * Uses first 100 characters as a fingerprint
 * @param {Document} doc - Document with pageContent
 * @returns {string} Unique identifier based on content prefix
 * @private
 */
function getDocId(doc) {
  return doc.pageContent.substring(0, 100);
}

/**
 * Hybrid re-ranking with RRF (Reciprocal Rank Fusion)
 * RRF is superior to weighted averaging because it's scale-invariant
 *
 * @param {Document[]} docs - Retrieved documents with metadata
 * @param {string} query - Search query
 * @param {number} [topK=5] - Number of top documents to return
 * @returns {RankedDocument[]} Top K re-ranked documents with scoring details
 */
export function rerankDocuments(docs, query, topK = 5) {
  if (!docs || docs.length === 0) return [];

  const avgDocLength =
    docs.reduce((sum, doc) => sum + doc.pageContent.split(/\s+/).length, 0) / docs.length;

  // Step 1: Create semantic ranking (docs already come sorted by semantic similarity)
  const semanticRanks = docs.map((doc, index) => ({
    doc,
    rank: index + 1,
    semanticScore: doc.metadata?.score || 1 / (index + 1),
  }));

  // Step 2: Create BM25 keyword ranking
  const bm25Scored = docs.map((doc) => ({
    doc,
    score: calculateBM25Score(query, doc.pageContent, avgDocLength),
  }));

  // Sort by BM25 score descending
  bm25Scored.sort((a, b) => b.score - a.score);
  const bm25Ranks = bm25Scored.map((item, index) => ({
    doc: item.doc,
    rank: index + 1,
    bm25Score: item.score,
  }));

  // Step 3: RRF Merge
  // Formula: RRF(d) = Σ(1 / (k + rank_i))
  const rrfScores = new Map();

  // Accumulate semantic ranks
  for (const { doc, rank, semanticScore } of semanticRanks) {
    const docId = getDocId(doc);
    if (!rrfScores.has(docId)) {
      rrfScores.set(docId, {
        doc,
        rrfScore: 0,
        semanticRank: rank,
        bm25Rank: null,
        semanticScore,
        bm25Score: null,
      });
    }
    rrfScores.get(docId).rrfScore += 1 / (RRF_K + rank);
  }

  // Accumulate BM25 ranks
  for (const { doc, rank, bm25Score } of bm25Ranks) {
    const docId = getDocId(doc);
    if (!rrfScores.has(docId)) {
      rrfScores.set(docId, {
        doc,
        rrfScore: 0,
        semanticRank: null,
        bm25Rank: rank,
        semanticScore: null,
        bm25Score,
      });
    }
    const entry = rrfScores.get(docId);
    entry.rrfScore += 1 / (RRF_K + rank);
    entry.bm25Rank = rank;
    entry.bm25Score = bm25Score;
  }

  // Convert to array and sort by RRF score
  const rankedDocs = Array.from(rrfScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((entry) => ({
      ...entry.doc,
      score: entry.rrfScore,
      semanticScore: entry.semanticScore,
      keywordScore: entry.bm25Score,
      semanticRank: entry.semanticRank,
      bm25Rank: entry.bm25Rank,
      rrfScore: entry.rrfScore,
    }));

  logger.debug('RRF hybrid scoring results', {
    service: 'rag',
    topDoc: {
      rrfScore: rankedDocs[0]?.rrfScore?.toFixed(4),
      semanticRank: rankedDocs[0]?.semanticRank,
      bm25Rank: rankedDocs[0]?.bm25Rank,
      semanticScore: rankedDocs[0]?.semanticScore?.toFixed(4),
      bm25Score: rankedDocs[0]?.keywordScore?.toFixed(4),
    },
  });

  return rankedDocs.slice(0, topK);
}

/**
 * LEGACY: Weighted hybrid scoring (kept for comparison)
 * Use rerankDocuments() instead - it uses RRF which is superior
 * @deprecated Use {@link rerankDocuments} instead for better results
 * @param {Document[]} docs - Retrieved documents with metadata
 * @param {string} query - Search query
 * @param {number} [topK=5] - Number of top documents to return
 * @returns {RankedDocument[]} Top K re-ranked documents
 */
export function rerankDocumentsWeighted(docs, query, topK = 5) {
  const avgDocLength =
    docs.reduce((sum, doc) => sum + doc.pageContent.split(/\s+/).length, 0) / docs.length;

  const scoredDocs = docs.map((doc, index) => {
    const semanticScore = doc.metadata?.score || 1 / (index + 1);
    const keywordScore = calculateBM25Score(query, doc.pageContent, avgDocLength);

    // Normalize keyword score (0-1 range)
    const normalizedKeywordScore = Math.min(keywordScore / 10, 1);

    // Hybrid score: 50% semantic + 50% keyword
    const hybridScore = semanticScore * 0.5 + normalizedKeywordScore * 0.5;

    return {
      ...doc,
      score: hybridScore,
      semanticScore,
      keywordScore: normalizedKeywordScore,
    };
  });

  // Sort by hybrid score (descending)
  scoredDocs.sort((a, b) => b.score - a.score);

  logger.debug('Weighted hybrid scoring results', {
    service: 'rag',
    topDoc: {
      hybridScore: scoredDocs[0]?.score?.toFixed(4),
      semanticScore: scoredDocs[0]?.semanticScore?.toFixed(4),
      keywordScore: scoredDocs[0]?.keywordScore?.toFixed(4),
    },
  });

  return scoredDocs.slice(0, topK);
}

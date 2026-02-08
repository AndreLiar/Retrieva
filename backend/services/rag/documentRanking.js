/**
 * Document ranking and scoring utilities for RAG
 * Includes BM25 keyword scoring and RRF hybrid re-ranking
 * @module services/rag/documentRanking
 */

import logger from '../../config/logger.js';
import { normalizeText, calculateTitleSimilarity, calculateHeadingPathSimilarity } from '../../utils/rag/textNormalization.js';

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
 * @property {number} [titleRank] - Rank by title similarity
 * @property {number} [titleSimilarity] - Title similarity score (0-1)
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
 * @property {number|null} titleRank - Rank in title similarity ordering
 * @property {number|null} titleSimilarity - Title similarity score
 */

// BM25 parameters (based on research)
const BM25_K1 = 1.5; // Term frequency saturation
const BM25_B = 0.75; // Length normalization
const RRF_K = 60; // RRF constant (standard value from research)

/**
 * Build a document-frequency map for a set of documents.
 * Used for proper BM25 IDF within a retrieved set.
 * @param {Document[]} docs - Retrieved documents
 * @returns {Map<string, number>} term → number of docs containing it
 */
export function buildDocFrequencyMap(docs) {
  const dfMap = new Map();
  for (const doc of docs) {
    const uniqueTerms = new Set(normalizeText(doc.pageContent).split(/\s+/));
    for (const term of uniqueTerms) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
    }
  }
  return dfMap;
}

/**
 * Calculate BM25 score for keyword matching
 * @param {string} query - Search query
 * @param {string} document - Document text
 * @param {number} avgDocLength - Average document length in corpus
 * @param {Map<string, number>} [dfMap] - Document frequency map (from buildDocFrequencyMap)
 * @param {number} [totalDocs] - Total documents in the set
 * @returns {number} - BM25 score
 */
export function calculateBM25Score(query, document, avgDocLength = 800, dfMap = null, totalDocs = 1) {
  const queryTerms = normalizeText(query).split(/\s+/);
  const docTerms = normalizeText(document).split(/\s+/);
  const docLength = docTerms.length;

  let score = 0;
  for (const term of queryTerms) {
    const termFreq = docTerms.filter((t) => t === term).length;
    if (termFreq > 0) {
      // Standard BM25 IDF: log(1 + (N - df + 0.5) / (df + 0.5))
      const df = dfMap ? (dfMap.get(term) || 1) : 1;
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
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
  const dfMap = buildDocFrequencyMap(docs);

  // Step 1: Create semantic ranking (docs already come sorted by semantic similarity)
  const semanticRanks = docs.map((doc, index) => ({
    doc,
    rank: index + 1,
    semanticScore: doc.metadata?.score || 1 / (index + 1),
  }));

  // Step 2: Create BM25 keyword ranking
  const bm25Scored = docs.map((doc) => ({
    doc,
    score: calculateBM25Score(query, doc.pageContent, avgDocLength, dfMap, docs.length),
  }));

  // Sort by BM25 score descending
  bm25Scored.sort((a, b) => b.score - a.score);
  const bm25Ranks = bm25Scored.map((item, index) => ({
    doc: item.doc,
    rank: index + 1,
    bm25Score: item.score,
  }));

  // Step 3: Create title similarity ranking
  const titleScored = docs.map((doc) => ({
    doc,
    similarity: calculateTitleSimilarity(query, doc.metadata?.documentTitle),
  }));
  titleScored.sort((a, b) => b.similarity - a.similarity);
  const titleRanks = titleScored.map((item, index) => ({
    doc: item.doc,
    rank: index + 1,
    titleSimilarity: item.similarity,
  }));

  // Step 3b: Create heading path similarity ranking
  const headingScored = docs.map((doc) => ({
    doc,
    similarity: calculateHeadingPathSimilarity(query, doc.metadata?.heading_path),
  }));
  headingScored.sort((a, b) => b.similarity - a.similarity);
  const headingRanks = headingScored.map((item, index) => ({
    doc: item.doc,
    rank: index + 1,
    headingSimilarity: item.similarity,
  }));

  // Step 4: RRF Merge
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
        titleRank: null,
        semanticScore,
        bm25Score: null,
        titleSimilarity: null,
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
        titleRank: null,
        semanticScore: null,
        bm25Score,
        titleSimilarity: null,
      });
    }
    const entry = rrfScores.get(docId);
    entry.rrfScore += 1 / (RRF_K + rank);
    entry.bm25Rank = rank;
    entry.bm25Score = bm25Score;
  }

  // Accumulate title ranks (only for docs with meaningful title similarity)
  for (const { doc, rank, titleSimilarity } of titleRanks) {
    const docId = getDocId(doc);
    if (!rrfScores.has(docId)) {
      rrfScores.set(docId, {
        doc,
        rrfScore: 0,
        semanticRank: null,
        bm25Rank: null,
        titleRank: rank,
        semanticScore: null,
        bm25Score: null,
        titleSimilarity,
      });
    }
    const entry = rrfScores.get(docId);
    entry.titleRank = rank;
    entry.titleSimilarity = titleSimilarity;

    // Only add RRF contribution for docs with meaningful title similarity
    if (titleSimilarity > 0.3) {
      entry.rrfScore += 1 / (RRF_K + rank);
    }

    // Additive bonus for near-exact title matches
    if (titleSimilarity > 0.8) {
      entry.rrfScore += 0.05;
    }
  }

  // Accumulate heading path ranks (boosts documents with relevant section headings)
  for (const { doc, rank, headingSimilarity } of headingRanks) {
    const docId = getDocId(doc);
    const entry = rrfScores.get(docId);
    if (entry) {
      entry.headingRank = rank;
      entry.headingSimilarity = headingSimilarity;

      // Add RRF contribution for docs with meaningful heading path match
      if (headingSimilarity > 0.3) {
        entry.rrfScore += 1 / (RRF_K + rank);
      }

      // Additive bonus for strong heading matches (query terms in section headers)
      if (headingSimilarity > 0.6) {
        entry.rrfScore += 0.03;
      }
    }
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
      titleRank: entry.titleRank,
      titleSimilarity: entry.titleSimilarity,
      headingRank: entry.headingRank,
      headingSimilarity: entry.headingSimilarity,
      rrfScore: entry.rrfScore,
    }));

  logger.debug('RRF hybrid scoring results', {
    service: 'rag',
    topDoc: {
      rrfScore: rankedDocs[0]?.rrfScore?.toFixed(4),
      semanticRank: rankedDocs[0]?.semanticRank,
      bm25Rank: rankedDocs[0]?.bm25Rank,
      titleRank: rankedDocs[0]?.titleRank,
      titleSimilarity: rankedDocs[0]?.titleSimilarity?.toFixed(4),
      headingRank: rankedDocs[0]?.headingRank,
      headingSimilarity: rankedDocs[0]?.headingSimilarity?.toFixed(4),
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
  const dfMap = buildDocFrequencyMap(docs);

  const scoredDocs = docs.map((doc, index) => {
    const semanticScore = doc.metadata?.score || 1 / (index + 1);
    const keywordScore = calculateBM25Score(query, doc.pageContent, avgDocLength, dfMap, docs.length);

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

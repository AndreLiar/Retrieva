/**
 * Entity Similarity Functions
 *
 * String and semantic similarity algorithms for entity matching.
 * Extracted from entityResolution.js for modularity.
 *
 * @module services/memory/entitySimilarity
 */

/**
 * Calculate string similarity using Levenshtein distance
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score (0-1)
 */
export function levenshteinSimilarity(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Calculate Jaccard similarity between two sets of tokens
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score (0-1)
 */
export function jaccardSimilarity(s1, s2) {
  const tokens1 = new Set(s1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(s2.toLowerCase().split(/\s+/));

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Cosine similarity between two vectors
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Calculate combined string similarity using multiple algorithms
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Maximum similarity score
 */
export function combinedStringSimilarity(s1, s2) {
  return Math.max(levenshteinSimilarity(s1, s2), jaccardSimilarity(s1, s2));
}

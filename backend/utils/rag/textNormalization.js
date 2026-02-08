/**
 * Text normalization utilities for RAG retrieval
 * Provides accent-insensitive text matching and title similarity scoring
 * @module utils/rag/textNormalization
 */

/**
 * Normalize text by stripping accents, lowercasing, and collapsing whitespace
 * Uses Unicode NFD decomposition to remove diacritical marks
 *
 * @param {string} text - Input text
 * @returns {string} Normalized text (lowercase, no accents, single spaces)
 * @example
 * normalizeText("Titre de séjour") // "titre de sejour"
 * normalizeText("  café   résumé  ") // "cafe resume"
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between a query and a document title
 * Uses a combination of exact match, containment, and Jaccard word similarity
 *
 * @param {string} query - Search query
 * @param {string} title - Document title
 * @returns {number} Similarity score between 0 and 1
 * @example
 * calculateTitleSimilarity("Liste de document demande titre de sejour", "Liste de document demande titre de séjour") // 1.0
 * calculateTitleSimilarity("titre de sejour", "Liste de document demande titre de séjour") // ~0.9
 */
export function calculateTitleSimilarity(query, title) {
  if (!query || !title) return 0;

  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(title);

  if (!normalizedQuery || !normalizedTitle) return 0;

  // Exact match after normalization
  if (normalizedQuery === normalizedTitle) return 1.0;

  const queryWords = new Set(normalizedQuery.split(' ').filter(Boolean));
  const titleWords = new Set(normalizedTitle.split(' ').filter(Boolean));

  if (queryWords.size === 0 || titleWords.size === 0) return 0;

  // Count shared words
  let intersection = 0;
  for (const word of queryWords) {
    if (titleWords.has(word)) intersection++;
  }

  // Full containment: all title words appear in query or vice versa
  const queryContainsTitle = intersection === titleWords.size;
  const titleContainsQuery = intersection === queryWords.size;

  if (queryContainsTitle || titleContainsQuery) return 0.9;

  // Jaccard similarity on word sets
  const union = new Set([...queryWords, ...titleWords]);
  return intersection / union.size;
}

/**
 * Calculate similarity between a query and a document's heading path
 * Checks if query terms appear in any of the headings
 *
 * @param {string} query - Search query
 * @param {string[]} headingPath - Array of heading strings (breadcrumb path)
 * @returns {number} Similarity score between 0 and 1
 * @example
 * calculateHeadingPathSimilarity("testing best practices", ["5. Testing", "Best Practices"]) // ~0.8
 */
export function calculateHeadingPathSimilarity(query, headingPath) {
  if (!query || !headingPath || !Array.isArray(headingPath) || headingPath.length === 0) {
    return 0;
  }

  const normalizedQuery = normalizeText(query);
  const queryWords = new Set(normalizedQuery.split(' ').filter((w) => w.length > 2));

  if (queryWords.size === 0) return 0;

  // Combine all headings into a single text for matching
  const combinedHeadings = headingPath.map((h) => normalizeText(h)).join(' ');
  const headingWords = new Set(combinedHeadings.split(' ').filter((w) => w.length > 2));

  if (headingWords.size === 0) return 0;

  // Count query words that appear in headings
  let matches = 0;
  for (const word of queryWords) {
    if (headingWords.has(word)) matches++;
  }

  // Calculate match ratio
  const matchRatio = matches / queryWords.size;

  // Bonus for exact heading match
  for (const heading of headingPath) {
    const normalizedHeading = normalizeText(heading);
    if (normalizedQuery.includes(normalizedHeading) || normalizedHeading.includes(normalizedQuery)) {
      return Math.max(matchRatio, 0.9);
    }
  }

  return matchRatio;
}

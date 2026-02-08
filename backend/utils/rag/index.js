/**
 * RAG Utilities Index
 *
 * Centralized exports for RAG-related utilities:
 * - Context formatting
 * - RAG caching
 * - Document retry tracking
 * - Qdrant exploration
 * - Token estimation (Phase 5)
 */

// Context Formatting
export { formatContext, formatSources } from './contextFormatter.js';

// RAG Cache
export { ragCache, RAGCache } from './ragCache.js';

// Document Retry Tracker
export { documentRetryTracker, DocumentRetryTracker } from './documentRetryTracker.js';

// Qdrant Explorer (CLI utility)
export { listDocuments, getCollectionInfo } from './qdrantExplorer.js';

// Text Normalization (accent stripping, title matching)
export { normalizeText, calculateTitleSimilarity } from './textNormalization.js';

// Token Estimation (Phase 5)
export {
  estimateTokens,
  estimateTokensAccurate,
  estimateTokensBatch,
  getCharsPerToken,
  detectContentType,
} from './tokenEstimation.js';

// Citation Validation (Determinism Fix #1)
export {
  extractCitations,
  validateCitations,
  normalizeCitationFormat,
  processCitations,
  analyzeCitationCoverage,
} from './citationValidator.js';

// Output Validation (Determinism Fix #2)
export {
  ragAnswerSchema,
  validateOutput,
  validateWithSchema,
  processOutput,
  shouldRetryOutput,
} from './outputValidator.js';

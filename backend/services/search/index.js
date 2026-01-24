/**
 * Search Services Index
 *
 * M2 INDEXED MEMORY: Enhanced search capabilities
 * - Sparse vectors for hybrid search (BM25)
 * - Vocabulary and IDF management
 *
 * @module services/search
 */

export {
  sparseVectorManager,
  SparseVectorManager,
  Vocabulary,
  SparseVector,
  WorkspaceStats,
} from './sparseVector.js';

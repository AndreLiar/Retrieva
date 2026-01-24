/**
 * Versioning Services Index
 *
 * M1 RAW MEMORY: Document versioning and history management
 *
 * @module services/versioning
 */

export {
  generateContentHash,
  createDocumentVersion,
  restoreDocumentVersion,
  getVersionHistory,
  compareVersions,
  findDuplicates,
  getVersioningStats,
} from './documentVersioning.js';

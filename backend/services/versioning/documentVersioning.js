/**
 * Document Versioning Service
 *
 * M1 RAW MEMORY: Manages document version history
 * - Creates versions on document updates
 * - Detects content changes via hashing
 * - Enables rollback to previous versions
 * - Content deduplication detection
 *
 * @module services/versioning/documentVersioning
 */

import { DocumentVersion } from '../../models/DocumentVersion.js';
import { DocumentSource } from '../../models/DocumentSource.js';
import logger from '../../config/logger.js';
import { contentHash } from '../../utils/security/crypto.js';

/**
 * @typedef {Object} VersionInfo
 * @property {number} version - Version number
 * @property {string} contentHash - Content hash
 * @property {string} changeType - Type of change
 * @property {Date} createdAt - Creation timestamp
 */

/**
 * Generate content hash for deduplication
 *
 * @param {string} content - Document content
 * @returns {string} SHA-256 hash
 */
export function generateContentHash(content) {
  return contentHash(content);
}

/**
 * Calculate simple diff stats between two contents
 *
 * @param {string} oldContent - Previous content
 * @param {string} newContent - New content
 * @returns {Object} Diff statistics
 */
function calculateDiff(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter((line) => !oldSet.has(line));
  const removed = oldLines.filter((line) => !newSet.has(line));

  // Identify modified sections (simple heuristic)
  const modifiedSections = [];
  if (added.length > 0 || removed.length > 0) {
    // Check for header changes
    const headerPattern = /^#{1,6}\s+/;
    const changedHeaders = [...added, ...removed]
      .filter((line) => headerPattern.test(line))
      .map((line) => line.replace(headerPattern, '').trim());

    if (changedHeaders.length > 0) {
      modifiedSections.push(...changedHeaders.slice(0, 5));
    }
  }

  return {
    addedLines: added.length,
    removedLines: removed.length,
    modifiedSections,
  };
}

/**
 * Create or update document version
 *
 * @param {string} documentSourceId - Document source ID
 * @param {string} content - Document content
 * @param {Object} options - Version options
 * @returns {Promise<{version: DocumentVersion, isNew: boolean, isDuplicate: boolean}>}
 */
export async function createDocumentVersion(documentSourceId, content, options = {}) {
  const {
    title = 'Untitled',
    workspaceId,
    metadata = {},
    sourceMetadata = {},
    forceCreate = false,
  } = options;

  const startTime = Date.now();
  const contentHash = generateContentHash(content);

  try {
    // Get latest version to compare
    const latestVersion = await DocumentVersion.findOne({ documentSourceId, isActive: true });

    // Check if content has changed
    if (latestVersion && latestVersion.contentHash === contentHash && !forceCreate) {
      logger.debug('Content unchanged, skipping version creation', {
        service: 'document-versioning',
        documentSourceId,
        version: latestVersion.version,
      });

      return {
        version: latestVersion,
        isNew: false,
        isDuplicate: false,
      };
    }

    // Check for content duplication across workspace
    const duplicates = await DocumentVersion.findByContentHash(contentHash, workspaceId);
    const isDuplicate =
      duplicates.length > 0 &&
      !duplicates.some((d) => d.documentSourceId.toString() === documentSourceId.toString());

    // Calculate diff if updating
    let diff = { addedLines: 0, removedLines: 0, modifiedSections: [] };
    let changeType = 'created';

    if (latestVersion) {
      diff = calculateDiff(latestVersion.content, content);
      changeType = 'updated';
    }

    // Create new version
    const version = await DocumentVersion.createVersion(documentSourceId, {
      workspaceId,
      contentHash,
      content,
      title,
      changeType,
      changeSummary: generateChangeSummary(changeType, diff),
      metadata: {
        wordCount: content.split(/\s+/).length,
        characterCount: content.length,
        ...metadata,
      },
      diff,
      sourceMetadata,
    });

    // Update DocumentSource with new contentHash
    await DocumentSource.findByIdAndUpdate(documentSourceId, {
      contentHash,
    });

    logger.info('Created document version', {
      service: 'document-versioning',
      documentSourceId,
      version: version.version,
      changeType,
      isDuplicate,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      version,
      isNew: true,
      isDuplicate,
      duplicateOf: isDuplicate ? duplicates[0] : null,
    };
  } catch (error) {
    logger.error('Failed to create document version', {
      service: 'document-versioning',
      documentSourceId,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Generate human-readable change summary
 */
function generateChangeSummary(changeType, diff) {
  if (changeType === 'created') {
    return 'Document created';
  }

  const parts = [];
  if (diff.addedLines > 0) {
    parts.push(`+${diff.addedLines} lines`);
  }
  if (diff.removedLines > 0) {
    parts.push(`-${diff.removedLines} lines`);
  }
  if (diff.modifiedSections.length > 0) {
    parts.push(`Sections: ${diff.modifiedSections.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Minor changes';
}

/**
 * Restore document to a previous version
 *
 * @param {string} documentSourceId - Document source ID
 * @param {number} targetVersion - Version number to restore
 * @returns {Promise<DocumentVersion>} New version created from restore
 */
export async function restoreDocumentVersion(documentSourceId, targetVersion) {
  const startTime = Date.now();

  try {
    // Get the target version
    const target = await DocumentVersion.findOne({
      documentSourceId,
      version: targetVersion,
    });

    if (!target) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    // Create a new version with the restored content
    const version = await DocumentVersion.createVersion(documentSourceId, {
      workspaceId: target.workspaceId,
      contentHash: target.contentHash,
      content: target.content,
      title: target.title,
      changeType: 'restored',
      changeSummary: `Restored from version ${targetVersion}`,
      metadata: target.metadata,
      diff: { addedLines: 0, removedLines: 0, modifiedSections: ['Full restore'] },
      sourceMetadata: target.sourceMetadata,
    });

    logger.info('Restored document version', {
      service: 'document-versioning',
      documentSourceId,
      fromVersion: targetVersion,
      toVersion: version.version,
      processingTimeMs: Date.now() - startTime,
    });

    return version;
  } catch (error) {
    logger.error('Failed to restore document version', {
      service: 'document-versioning',
      documentSourceId,
      targetVersion,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get version history for a document
 *
 * @param {string} documentSourceId - Document source ID
 * @param {Object} options - Query options
 * @returns {Promise<VersionInfo[]>}
 */
export async function getVersionHistory(documentSourceId, options = {}) {
  const { limit = 20, includeContent = false } = options;

  return DocumentVersion.getVersionHistory(documentSourceId, { limit, includeContent });
}

/**
 * Compare two versions
 *
 * @param {string} documentSourceId - Document source ID
 * @param {number} fromVersion - From version number
 * @param {number} toVersion - To version number
 * @returns {Promise<Object>} Diff result
 */
export async function compareVersions(documentSourceId, fromVersion, toVersion) {
  return DocumentVersion.getVersionDiff(documentSourceId, fromVersion, toVersion);
}

/**
 * Find duplicate content across workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} Duplicate groups
 */
export async function findDuplicates(workspaceId) {
  const duplicates = await DocumentVersion.aggregate([
    { $match: { workspaceId, isActive: true } },
    {
      $group: {
        _id: '$contentHash',
        count: { $sum: 1 },
        documents: {
          $push: {
            documentSourceId: '$documentSourceId',
            title: '$title',
            version: '$version',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return duplicates.map((d) => ({
    contentHash: d._id,
    count: d.count,
    documents: d.documents,
  }));
}

/**
 * Get versioning statistics
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Object>} Statistics
 */
export async function getVersioningStats(workspaceId) {
  const [totalVersions, documentsWithVersions, changeTypes, duplicateCount] = await Promise.all([
    DocumentVersion.countDocuments({ workspaceId }),
    DocumentVersion.distinct('documentSourceId', { workspaceId }).then((ids) => ids.length),
    DocumentVersion.aggregate([
      { $match: { workspaceId } },
      { $group: { _id: '$changeType', count: { $sum: 1 } } },
    ]),
    DocumentVersion.aggregate([
      { $match: { workspaceId, isActive: true } },
      { $group: { _id: '$contentHash', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' },
    ]).then((r) => r[0]?.total || 0),
  ]);

  const avgVersionsPerDoc =
    documentsWithVersions > 0 ? (totalVersions / documentsWithVersions).toFixed(1) : 0;

  return {
    totalVersions,
    documentsWithVersions,
    avgVersionsPerDocument: parseFloat(avgVersionsPerDoc),
    changeTypes: Object.fromEntries(changeTypes.map((c) => [c._id, c.count])),
    duplicateContentGroups: duplicateCount,
  };
}

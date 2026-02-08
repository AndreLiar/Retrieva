/**
 * Cross-Document Deduplication Service (Phase 5)
 *
 * Prevents duplicate content from being indexed across documents.
 * Uses content hashing to detect and skip duplicates at index time.
 *
 * @module services/rag/indexDeduplication
 */

import mongoose from 'mongoose';
import logger from '../../config/logger.js';
import { sha256 } from '../../utils/security/crypto.js';

/**
 * ContentHash Model Schema
 * Stores content hashes per workspace for deduplication
 */
const contentHashSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    contentHash: {
      type: String,
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    // Store a fingerprint for debugging
    contentFingerprint: {
      type: String,
      maxlength: 100,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'content_hashes',
  }
);

// Compound index for efficient lookups
contentHashSchema.index({ workspaceId: 1, contentHash: 1 }, { unique: true });
contentHashSchema.index({ workspaceId: 1, sourceId: 1 });

export const ContentHash =
  mongoose.models.ContentHash || mongoose.model('ContentHash', contentHashSchema);

/**
 * Normalize content for consistent hashing
 * Removes whitespace variations that shouldn't affect semantic meaning
 *
 * @param {string} content - Raw content
 * @returns {string} Normalized content
 */
export function normalizeContent(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return content
    .toLowerCase()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/^\s+|\s+$/g, '') // Trim
    .replace(/['']/g, "'") // Normalize quotes
    .replace(/[""]/g, '"');
}

/**
 * Generate content hash for deduplication
 *
 * @param {string} content - Content to hash
 * @returns {string} SHA-256 hash of normalized content
 */
export function generateContentHash(content) {
  const normalized = normalizeContent(content);
  return sha256(normalized);
}

/**
 * ContentHashIndex class for managing content hash operations
 */
class ContentHashIndex {
  /**
   * Check if content already exists in index
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} contentHash - Content hash to check
   * @returns {Promise<boolean>} True if exists
   */
  async exists(workspaceId, contentHash) {
    const existing = await ContentHash.findOne({
      workspaceId,
      contentHash,
    }).lean();
    return !!existing;
  }

  /**
   * Check multiple hashes at once
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} hashes - Array of content hashes
   * @param {Object} options - Optional settings
   * @param {string} options.excludeSourceId - Exclude hashes from this sourceId (for updates)
   * @returns {Promise<Set<string>>} Set of existing hashes
   */
  async existsMany(workspaceId, hashes, options = {}) {
    if (!hashes || hashes.length === 0) {
      return new Set();
    }

    const query = {
      workspaceId,
      contentHash: { $in: hashes },
    };

    // For updates: exclude hashes from the same source document
    // This prevents marking updated content as duplicates of the old version
    if (options.excludeSourceId) {
      query.sourceId = { $ne: options.excludeSourceId };
    }

    const existing = await ContentHash.find(query)
      .select('contentHash')
      .lean();

    return new Set(existing.map((e) => e.contentHash));
  }

  /**
   * Add content hashes to index
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Array} chunks - Array of {contentHash, sourceId, chunkIndex, contentFingerprint}
   * @returns {Promise<number>} Number of hashes added
   */
  async addMany(workspaceId, chunks) {
    if (!chunks || chunks.length === 0) {
      return 0;
    }

    const operations = chunks.map((chunk) => ({
      updateOne: {
        filter: {
          workspaceId,
          contentHash: chunk.contentHash,
        },
        update: {
          $setOnInsert: {
            workspaceId,
            contentHash: chunk.contentHash,
            sourceId: chunk.sourceId,
            chunkIndex: chunk.chunkIndex,
            contentFingerprint: chunk.contentFingerprint,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    try {
      const result = await ContentHash.bulkWrite(operations, { ordered: false });
      return result.upsertedCount || 0;
    } catch (error) {
      // Handle duplicate key errors gracefully
      if (error.code === 11000) {
        logger.debug('Some hashes already existed (expected during concurrent indexing)', {
          service: 'dedup',
        });
        return 0;
      }
      throw error;
    }
  }

  /**
   * Remove hashes for a specific source document
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source document ID
   * @returns {Promise<number>} Number of hashes removed
   */
  async removeBySource(workspaceId, sourceId) {
    const result = await ContentHash.deleteMany({ workspaceId, sourceId });
    return result.deletedCount || 0;
  }

  /**
   * Remove all hashes for a workspace
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<number>} Number of hashes removed
   */
  async removeByWorkspace(workspaceId) {
    const result = await ContentHash.deleteMany({ workspaceId });
    return result.deletedCount || 0;
  }

  /**
   * Get hash count for a workspace
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<number>} Hash count
   */
  async count(workspaceId) {
    return ContentHash.countDocuments({ workspaceId });
  }
}

export const contentHashIndex = new ContentHashIndex();

/**
 * Deduplicate chunks before indexing
 * Checks existing index and removes duplicate content
 *
 * IMPORTANT: For updates, we exclude hashes from the same sourceId to avoid
 * marking updated content as duplicates of the old version being replaced.
 * This is critical for the transactional update approach where old chunks
 * remain until new chunks are verified.
 *
 * @param {Array} chunks - Array of chunks with pageContent
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Source document ID (excluded from duplicate check)
 * @returns {Promise<Object>} {unique: Array, duplicates: Array, stats: Object}
 */
export async function deduplicateChunksAtIndex(chunks, workspaceId, sourceId) {
  if (!chunks || chunks.length === 0) {
    return { unique: [], duplicates: [], stats: { total: 0, unique: 0, duplicates: 0 } };
  }

  const startTime = Date.now();

  // Generate hashes for all chunks
  const chunksWithHashes = chunks.map((chunk, index) => {
    const contentHash = generateContentHash(chunk.pageContent);
    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        contentHash,
        chunkIndex: index,
      },
      _hash: contentHash,
      _index: index,
    };
  });

  // Check which hashes already exist (excluding current sourceId for updates)
  // This prevents marking updated content as duplicates of the old version
  const allHashes = chunksWithHashes.map((c) => c._hash);
  const existingHashes = await contentHashIndex.existsMany(workspaceId, allHashes, {
    excludeSourceId: sourceId,
  });

  // Separate unique and duplicate chunks
  const unique = [];
  const duplicates = [];
  const seenInBatch = new Set();

  for (const chunk of chunksWithHashes) {
    const hash = chunk._hash;

    if (existingHashes.has(hash) || seenInBatch.has(hash)) {
      duplicates.push({
        chunk,
        reason: existingHashes.has(hash) ? 'existing_index' : 'duplicate_in_batch',
      });
    } else {
      unique.push(chunk);
      seenInBatch.add(hash);
    }
  }

  const stats = {
    total: chunks.length,
    unique: unique.length,
    duplicates: duplicates.length,
    processingTimeMs: Date.now() - startTime,
  };

  if (duplicates.length > 0) {
    logger.info('Deduplication complete', {
      service: 'dedup',
      workspaceId,
      sourceId,
      ...stats,
    });
  }

  return { unique, duplicates, stats };
}

/**
 * Record indexed chunks in the content hash index
 * Call this after successful indexing
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} sourceId - Source document ID
 * @param {Array} chunks - Indexed chunks with contentHash in metadata
 * @returns {Promise<number>} Number of hashes recorded
 */
export async function recordIndexedChunks(workspaceId, sourceId, chunks) {
  if (!chunks || chunks.length === 0) {
    return 0;
  }

  const hashRecords = chunks
    .filter((chunk) => chunk.metadata?.contentHash)
    .map((chunk, index) => ({
      contentHash: chunk.metadata.contentHash,
      sourceId,
      chunkIndex: chunk.metadata?.chunkIndex ?? index,
      contentFingerprint: chunk.pageContent?.substring(0, 100),
    }));

  if (hashRecords.length === 0) {
    return 0;
  }

  const added = await contentHashIndex.addMany(workspaceId, hashRecords);

  logger.debug('Recorded content hashes', {
    service: 'dedup',
    workspaceId,
    sourceId,
    chunksProcessed: chunks.length,
    hashesAdded: added,
  });

  return added;
}

export default {
  ContentHash,
  contentHashIndex,
  normalizeContent,
  generateContentHash,
  deduplicateChunksAtIndex,
  recordIndexedChunks,
};

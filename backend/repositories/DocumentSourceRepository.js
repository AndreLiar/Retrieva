/**
 * DocumentSource Repository
 *
 * Encapsulates all data access for DocumentSource model.
 * Complex queries extracted from model statics.
 */

import { BaseRepository } from './BaseRepository.js';
import { DocumentSource } from '../models/DocumentSource.js';

class DocumentSourceRepository extends BaseRepository {
  constructor(model = DocumentSource) {
    super(model);
  }

  /**
   * Find documents needing sync
   * @param {string} workspaceId - Workspace ID
   * @param {Date} lastSyncTime - Last sync timestamp (optional)
   * @returns {Promise<Array>}
   */
  async findNeedingSync(workspaceId, lastSyncTime = null) {
    const query = {
      workspaceId,
      syncStatus: { $in: ['pending', 'error'] },
    };

    if (lastSyncTime) {
      query.$or = [{ lastModifiedInSource: { $gt: lastSyncTime } }, { lastSyncedAt: null }];
    }

    return this.find(query);
  }

  /**
   * Find document by source ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source ID (e.g., Notion page ID)
   * @returns {Promise<Document|null>}
   */
  async findBySourceId(workspaceId, sourceId) {
    return this.findOne({ workspaceId, sourceId });
  }

  /**
   * Get documents by sync status
   * @param {string} workspaceId - Workspace ID
   * @param {string} status - Sync status
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findBySyncStatus(workspaceId, status, options = {}) {
    return this.find(
      { workspaceId, syncStatus: status },
      { sort: { lastModifiedInSource: -1 }, ...options }
    );
  }

  /**
   * Get synced documents for a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findSyncedDocuments(workspaceId, options = {}) {
    return this.findBySyncStatus(workspaceId, 'synced', options);
  }

  /**
   * Get documents with errors
   * @param {string} workspaceId - Workspace ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findErrorDocuments(workspaceId, options = {}) {
    return this.findBySyncStatus(workspaceId, 'error', options);
  }

  /**
   * Upsert document (create or update)
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source ID
   * @param {Object} data - Document data
   * @returns {Promise<Document>}
   */
  async upsertDocument(workspaceId, sourceId, data) {
    return this.model.findOneAndUpdate(
      { workspaceId, sourceId },
      {
        $set: {
          ...data,
          workspaceId,
          sourceId,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
  }

  /**
   * Mark document as synced
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source ID
   * @param {Array} vectorStoreIds - Vector store IDs
   * @param {number} chunkCount - Number of chunks
   * @returns {Promise<Document>}
   */
  async markAsSynced(workspaceId, sourceId, vectorStoreIds = [], chunkCount = 0) {
    return this.updateOne(
      { workspaceId, sourceId },
      {
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        vectorStoreIds,
        chunkCount,
      }
    );
  }

  /**
   * Mark document as deleted
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source ID
   * @returns {Promise<Document>}
   */
  async markAsDeleted(workspaceId, sourceId) {
    return this.updateOne({ workspaceId, sourceId }, { syncStatus: 'deleted' });
  }

  /**
   * Mark multiple documents as deleted
   * @param {string} workspaceId - Workspace ID
   * @param {Array} sourceIds - Array of source IDs
   * @returns {Promise<Object>}
   */
  async markManyAsDeleted(workspaceId, sourceIds) {
    return this.updateMany(
      { workspaceId, sourceId: { $in: sourceIds } },
      { syncStatus: 'deleted' }
    );
  }

  /**
   * Add error to document
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source ID
   * @param {Error} error - Error object
   * @param {number} retryCount - Current retry count
   * @returns {Promise<Document>}
   */
  async addError(workspaceId, sourceId, error, retryCount = 0) {
    return this.model.findOneAndUpdate(
      { workspaceId, sourceId },
      {
        $push: {
          errorLog: {
            $each: [
              {
                timestamp: new Date(),
                error: error.toString(),
                retryCount,
              },
            ],
            $slice: -10, // Keep only last 10 errors
          },
        },
        $set: { syncStatus: 'error' },
      },
      { new: true }
    );
  }

  /**
   * Get workspace document counts
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async getWorkspaceCounts(workspaceId) {
    const result = await this.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: '$syncStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = {
      total: 0,
      synced: 0,
      pending: 0,
      error: 0,
      deleted: 0,
    };

    for (const item of result) {
      counts[item._id] = item.count;
      if (item._id !== 'deleted') {
        counts.total += item.count;
      }
    }

    return counts;
  }

  /**
   * Get documents by type
   * @param {string} workspaceId - Workspace ID
   * @param {string} documentType - Document type (page, database, file)
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByDocumentType(workspaceId, documentType, options = {}) {
    return this.find(
      {
        workspaceId,
        documentType,
        syncStatus: { $ne: 'deleted' },
      },
      { sort: { title: 1 }, ...options }
    );
  }

  /**
   * Search documents by title
   * @param {string} workspaceId - Workspace ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async searchByTitle(workspaceId, searchTerm, options = {}) {
    return this.find(
      {
        workspaceId,
        title: { $regex: searchTerm, $options: 'i' },
        syncStatus: { $ne: 'deleted' },
      },
      { sort: { title: 1 }, ...options }
    );
  }

  /**
   * Get vector store IDs for workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>}
   */
  async getVectorStoreIds(workspaceId) {
    const docs = await this.find(
      {
        workspaceId,
        syncStatus: 'synced',
        vectorStoreIds: { $exists: true, $ne: [] },
      },
      { select: 'vectorStoreIds' }
    );

    return docs.flatMap((d) => d.vectorStoreIds);
  }

  /**
   * Get total chunks for workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<number>}
   */
  async getTotalChunks(workspaceId) {
    const result = await this.aggregate([
      { $match: { workspaceId, syncStatus: 'synced' } },
      { $group: { _id: null, totalChunks: { $sum: '$chunkCount' } } },
    ]);

    return result[0]?.totalChunks || 0;
  }

  /**
   * Find documents modified since last sync
   * @param {string} workspaceId - Workspace ID
   * @param {Date} since - Date to compare
   * @returns {Promise<Array>}
   */
  async findModifiedSince(workspaceId, since) {
    return this.find({
      workspaceId,
      lastModifiedInSource: { $gt: since },
      syncStatus: { $ne: 'deleted' },
    });
  }

  /**
   * Bulk update sync status
   * @param {string} workspaceId - Workspace ID
   * @param {Array} sourceIds - Source IDs
   * @param {string} status - New status
   * @returns {Promise<Object>}
   */
  async bulkUpdateStatus(workspaceId, sourceIds, status) {
    return this.updateMany({ workspaceId, sourceId: { $in: sourceIds } }, { syncStatus: status });
  }
}

// Singleton instance for backward compatibility
const documentSourceRepository = new DocumentSourceRepository();

export { DocumentSourceRepository, documentSourceRepository };

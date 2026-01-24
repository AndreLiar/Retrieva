/**
 * NotionWorkspace Repository
 *
 * Encapsulates all data access for NotionWorkspace model.
 * Provides common query patterns for Notion workspace management.
 */

import { BaseRepository } from './BaseRepository.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';

class NotionWorkspaceRepository extends BaseRepository {
  constructor(model = NotionWorkspace) {
    super(model);
  }

  /**
   * Find workspaces by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByUser(userId, options = {}) {
    return this.find(
      { userId },
      {
        sort: { createdAt: -1 },
        select: '-accessToken',
        ...options,
      }
    );
  }

  /**
   * Find workspace by Notion workspace ID
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<Document|null>}
   */
  async findByWorkspaceId(workspaceId) {
    return this.findOne({ workspaceId });
  }

  /**
   * Find workspace by ID without access token
   * @param {string} id - MongoDB ID
   * @returns {Promise<Document|null>}
   */
  async findByIdSafe(id) {
    return this.findById(id, { select: '-accessToken' });
  }

  /**
   * Get workspaces by sync status
   * @param {string} status - Sync status
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findBySyncStatus(status, options = {}) {
    return this.find({ syncStatus: status }, { sort: { lastSyncAt: -1 }, ...options });
  }

  /**
   * Get workspaces needing sync
   * @returns {Promise<Array>}
   */
  async findNeedingSync() {
    return this.find({
      syncStatus: 'active',
      'syncSettings.autoSync': true,
    });
  }

  /**
   * Get workspaces due for sync
   * @returns {Promise<Array>}
   */
  async findDueForSync() {
    return this.find({
      syncStatus: 'active',
      'syncSettings.autoSync': true,
      $or: [
        { lastSyncAt: null },
        {
          $expr: {
            $lt: [
              '$lastSyncAt',
              {
                $subtract: [
                  new Date(),
                  { $multiply: ['$syncSettings.syncIntervalHours', 60 * 60 * 1000] },
                ],
              },
            ],
          },
        },
      ],
    });
  }

  /**
   * Update sync status
   * @param {string} workspaceId - Notion workspace ID
   * @param {string} status - New status
   * @param {string} jobId - Job ID (optional)
   * @returns {Promise<Document>}
   */
  async updateSyncStatus(workspaceId, status, jobId = null) {
    const update = { syncStatus: status };
    if (jobId) {
      update['syncSettings.lastSyncJobId'] = jobId;
    }
    if (status === 'syncing') {
      update.lastSyncAt = new Date();
    }
    return this.updateOne({ workspaceId }, update);
  }

  /**
   * Mark sync as successful
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<Document>}
   */
  async markSyncSuccessful(workspaceId) {
    return this.updateOne(
      { workspaceId },
      {
        syncStatus: 'active',
        lastSuccessfulSyncAt: new Date(),
      }
    );
  }

  /**
   * Update workspace stats
   * @param {string} workspaceId - Notion workspace ID
   * @param {Object} stats - Stats to update
   * @returns {Promise<Document>}
   */
  async updateStats(workspaceId, stats) {
    return this.updateOne({ workspaceId }, { $set: { stats } });
  }

  /**
   * Increment error count
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<Document>}
   */
  async incrementErrorCount(workspaceId) {
    return this.model.findOneAndUpdate(
      { workspaceId },
      {
        $inc: { 'stats.errorCount': 1 },
        $set: { syncStatus: 'error' },
      },
      { new: true }
    );
  }

  /**
   * Reset error count
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<Document>}
   */
  async resetErrorCount(workspaceId) {
    return this.updateOne({ workspaceId }, { 'stats.errorCount': 0 });
  }

  /**
   * Update sync settings
   * @param {string} workspaceId - Notion workspace ID
   * @param {Object} settings - Sync settings
   * @returns {Promise<Document>}
   */
  async updateSyncSettings(workspaceId, settings) {
    const update = {};
    for (const [key, value] of Object.entries(settings)) {
      update[`syncSettings.${key}`] = value;
    }
    return this.updateOne({ workspaceId }, { $set: update });
  }

  /**
   * Update included/excluded pages
   * @param {string} workspaceId - Notion workspace ID
   * @param {Object} pages - { includedPages, excludedPages }
   * @returns {Promise<Document>}
   */
  async updatePageFilters(workspaceId, pages) {
    const update = {};
    if (pages.includedPages !== undefined) {
      update.includedPages = pages.includedPages;
    }
    if (pages.excludedPages !== undefined) {
      update.excludedPages = pages.excludedPages;
    }
    if (pages.syncScope !== undefined) {
      update.syncScope = pages.syncScope;
    }
    return this.updateOne({ workspaceId }, update);
  }

  /**
   * Update access token
   * @param {string} workspaceId - Notion workspace ID
   * @param {string} accessToken - New access token
   * @returns {Promise<Document>}
   */
  async updateAccessToken(workspaceId, accessToken) {
    return this.updateOne({ workspaceId }, { accessToken });
  }

  /**
   * Disconnect workspace (soft delete)
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<Document>}
   */
  async disconnect(workspaceId) {
    return this.updateOne({ workspaceId }, { syncStatus: 'paused' });
  }

  /**
   * Get workspace count by user
   * @param {string} userId - User ID
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    return this.count({ userId });
  }

  /**
   * Get all workspaces with auto-sync enabled
   * @returns {Promise<Array>}
   */
  async findAutoSyncEnabled() {
    return this.find({
      'syncSettings.autoSync': true,
      syncStatus: { $ne: 'paused' },
    });
  }

  /**
   * Get workspace summary for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getUserSummary(userId) {
    const result = await this.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalWorkspaces: { $sum: 1 },
          totalPages: { $sum: '$stats.totalPages' },
          totalDatabases: { $sum: '$stats.totalDatabases' },
          totalDocuments: { $sum: '$stats.totalDocuments' },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$syncStatus', 'active'] }, 1, 0] },
          },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$syncStatus', 'error'] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      result[0] || {
        totalWorkspaces: 0,
        totalPages: 0,
        totalDatabases: 0,
        totalDocuments: 0,
        activeCount: 0,
        errorCount: 0,
      }
    );
  }
}

// Singleton instance for backward compatibility
const notionWorkspaceRepository = new NotionWorkspaceRepository();

export { NotionWorkspaceRepository, notionWorkspaceRepository };

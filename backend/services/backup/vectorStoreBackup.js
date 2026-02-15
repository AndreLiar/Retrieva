/**
 * Vector Store Backup Service
 *
 * M2 INDEXED MEMORY: Backup and restore Qdrant vector store
 * - Create snapshots of collections
 * - Restore from snapshots
 * - Schedule automated backups
 *
 * @module services/backup/vectorStoreBackup
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import path from 'path';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} BackupInfo
 * @property {string} name - Backup name
 * @property {string} collection - Collection name
 * @property {Date} createdAt - Creation timestamp
 * @property {number} size - Backup size in bytes
 * @property {string} path - Backup file path
 */

/**
 * Vector Store Backup Manager
 */
class VectorStoreBackupManager {
  constructor() {
    this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    this.collectionName = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';
    this.backupDir = process.env.BACKUP_DIR || './backups/qdrant';
    this.client = null;
  }

  /**
   * Initialize Qdrant client
   * @private
   */
  async _ensureClient() {
    if (!this.client) {
      const apiKey = process.env.QDRANT_API_KEY;
      this.client = new QdrantClient({ url: this.qdrantUrl, ...(apiKey && { apiKey }) });
    }
    return this.client;
  }

  /**
   * Ensure backup directory exists
   * @private
   */
  async _ensureBackupDir() {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  /**
   * Create a snapshot of the collection
   *
   * @param {Object} options - Backup options
   * @returns {Promise<BackupInfo>}
   */
  async createSnapshot(options = {}) {
    const { collection = this.collectionName, name = null } = options;
    const startTime = Date.now();

    try {
      await this._ensureClient();
      await this._ensureBackupDir();

      logger.info('Creating vector store snapshot', {
        service: 'vector-backup',
        collection,
      });

      // Create snapshot via Qdrant API
      const snapshot = await this.client.createSnapshot(collection);

      const backupName = name || `backup_${collection}_${Date.now()}`;
      const backupPath = path.join(this.backupDir, `${backupName}.snapshot`);

      // Download snapshot
      const snapshotData = await this.client.downloadSnapshot(collection, snapshot.name);

      // Save to file
      await fs.writeFile(backupPath, Buffer.from(snapshotData));

      const stats = await fs.stat(backupPath);

      const backupInfo = {
        name: backupName,
        snapshotName: snapshot.name,
        collection,
        createdAt: new Date(),
        size: stats.size,
        path: backupPath,
        processingTimeMs: Date.now() - startTime,
      };

      // Save backup metadata
      await this._saveBackupMetadata(backupInfo);

      logger.info('Vector store snapshot created', {
        service: 'vector-backup',
        ...backupInfo,
      });

      return backupInfo;
    } catch (error) {
      logger.error('Failed to create vector store snapshot', {
        service: 'vector-backup',
        collection,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * List available backups
   *
   * @param {Object} options - List options
   * @returns {Promise<BackupInfo[]>}
   */
  async listBackups(options = {}) {
    const { collection = this.collectionName } = options;

    try {
      await this._ensureBackupDir();

      const metadataPath = path.join(this.backupDir, 'backup_metadata.json');

      try {
        const data = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(data);

        return metadata.backups
          .filter((b) => !collection || b.collection === collection)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } catch {
        return [];
      }
    } catch (error) {
      logger.error('Failed to list backups', {
        service: 'vector-backup',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Restore from a snapshot
   *
   * @param {string} backupName - Backup name to restore
   * @param {Object} options - Restore options
   * @returns {Promise<boolean>}
   */
  async restoreSnapshot(backupName, options = {}) {
    const { targetCollection = null } = options;
    const startTime = Date.now();

    try {
      await this._ensureClient();

      // Find backup info
      const backups = await this.listBackups();
      const backup = backups.find((b) => b.name === backupName);

      if (!backup) {
        throw new Error(`Backup ${backupName} not found`);
      }

      const collection = targetCollection || backup.collection;

      logger.info('Restoring vector store from snapshot', {
        service: 'vector-backup',
        backupName,
        collection,
      });

      // Read snapshot file
      const snapshotData = await fs.readFile(backup.path);

      // Upload snapshot to Qdrant
      await this.client.recoverSnapshot(collection, {
        location: {
          data: snapshotData.toString('base64'),
        },
      });

      logger.info('Vector store restored from snapshot', {
        service: 'vector-backup',
        backupName,
        collection,
        processingTimeMs: Date.now() - startTime,
      });

      return true;
    } catch (error) {
      logger.error('Failed to restore vector store snapshot', {
        service: 'vector-backup',
        backupName,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Delete a backup
   *
   * @param {string} backupName - Backup name to delete
   * @returns {Promise<boolean>}
   */
  async deleteBackup(backupName) {
    try {
      const backups = await this.listBackups();
      const backup = backups.find((b) => b.name === backupName);

      if (!backup) {
        throw new Error(`Backup ${backupName} not found`);
      }

      // Delete snapshot file
      await fs.unlink(backup.path);

      // Update metadata
      const metadataPath = path.join(this.backupDir, 'backup_metadata.json');
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);
      metadata.backups = metadata.backups.filter((b) => b.name !== backupName);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info('Backup deleted', {
        service: 'vector-backup',
        backupName,
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete backup', {
        service: 'vector-backup',
        backupName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clean up old backups (retention policy)
   *
   * @param {Object} options - Cleanup options
   * @returns {Promise<number>} Number of backups deleted
   */
  async cleanupOldBackups(options = {}) {
    const { maxAge = 30, maxCount = 10 } = options; // days and count

    try {
      const backups = await this.listBackups();
      const now = new Date();
      const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

      let deleted = 0;

      // Delete by age
      for (const backup of backups) {
        const age = now - new Date(backup.createdAt);
        if (age > maxAgeMs) {
          await this.deleteBackup(backup.name);
          deleted++;
        }
      }

      // Delete by count (keep only maxCount recent backups)
      const remainingBackups = await this.listBackups();
      if (remainingBackups.length > maxCount) {
        const toDelete = remainingBackups.slice(maxCount);
        for (const backup of toDelete) {
          await this.deleteBackup(backup.name);
          deleted++;
        }
      }

      logger.info('Backup cleanup complete', {
        service: 'vector-backup',
        deleted,
      });

      return deleted;
    } catch (error) {
      logger.error('Backup cleanup failed', {
        service: 'vector-backup',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get collection statistics
   *
   * @param {string} collection - Collection name
   * @returns {Promise<Object>}
   */
  async getCollectionStats(collection = this.collectionName) {
    try {
      await this._ensureClient();

      const info = await this.client.getCollection(collection);

      return {
        collection,
        vectorsCount: info.vectors_count,
        pointsCount: info.points_count,
        segmentsCount: info.segments_count,
        status: info.status,
        config: info.config,
      };
    } catch (error) {
      logger.error('Failed to get collection stats', {
        service: 'vector-backup',
        collection,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Save backup metadata
   * @private
   */
  async _saveBackupMetadata(backupInfo) {
    const metadataPath = path.join(this.backupDir, 'backup_metadata.json');

    let metadata = { backups: [] };
    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(data);
    } catch {
      // File doesn't exist, use default
    }

    metadata.backups.push(backupInfo);
    metadata.lastUpdated = new Date();

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
}

// Singleton instance
export const vectorStoreBackup = new VectorStoreBackupManager();

// Export class for testing
export { VectorStoreBackupManager };

/**
 * Schedule automated backups
 *
 * @param {Object} options - Schedule options
 * @returns {NodeJS.Timeout} Interval handle
 */
export function scheduleBackups(options = {}) {
  const { intervalHours = 24, maxBackups = 7, onComplete = null, onError = null } = options;

  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info('Scheduling automated vector store backups', {
    service: 'vector-backup',
    intervalHours,
    maxBackups,
  });

  const runBackup = async () => {
    try {
      const backup = await vectorStoreBackup.createSnapshot();
      await vectorStoreBackup.cleanupOldBackups({ maxCount: maxBackups });

      if (onComplete) onComplete(backup);
    } catch (error) {
      logger.error('Scheduled backup failed', {
        service: 'vector-backup',
        error: error.message,
      });
      if (onError) onError(error);
    }
  };

  // Run immediately and then on interval
  runBackup();
  return setInterval(runBackup, intervalMs);
}

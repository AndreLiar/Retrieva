/**
 * SyncJob Repository
 *
 * Encapsulates all data access for SyncJob model.
 * Complex queries extracted from model statics.
 */

import { BaseRepository } from './BaseRepository.js';
import { SyncJob } from '../models/SyncJob.js';

class SyncJobRepository extends BaseRepository {
  constructor(model = SyncJob) {
    super(model);
  }

  /**
   * Get active jobs for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>} - Active jobs
   */
  async getActiveJobs(workspaceId) {
    return this.find(
      {
        workspaceId,
        status: { $in: ['queued', 'processing'] },
      },
      { sort: { createdAt: -1 } }
    );
  }

  /**
   * Get job history for a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {number} limit - Number of jobs to return
   * @returns {Promise<Array>} - Job history
   */
  async getJobHistory(workspaceId, limit = 20) {
    return this.find({ workspaceId }, { sort: { createdAt: -1 }, limit });
  }

  /**
   * Find job by job ID
   * @param {string} jobId - Job ID (not MongoDB _id)
   * @returns {Promise<Document|null>}
   */
  async findByJobId(jobId) {
    return this.findOne({ jobId });
  }

  /**
   * Check if workspace has active jobs
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<boolean>}
   */
  async hasActiveJobs(workspaceId) {
    return this.exists({
      workspaceId,
      status: { $in: ['queued', 'processing'] },
    });
  }

  /**
   * Get jobs by status
   * @param {string|Array} status - Status or array of statuses
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByStatus(status, options = {}) {
    const statusFilter = Array.isArray(status) ? { $in: status } : status;

    return this.find({ status: statusFilter }, { sort: { createdAt: -1 }, ...options });
  }

  /**
   * Get failed jobs that need retry
   * @param {number} maxRetries - Maximum retry count
   * @returns {Promise<Array>}
   */
  async getFailedJobsForRetry(maxRetries = 3) {
    return this.find({
      status: 'failed',
      retryCount: { $lt: maxRetries },
      $or: [{ nextRetryAt: { $lte: new Date() } }, { nextRetryAt: null }],
    });
  }

  /**
   * Create a new sync job
   * @param {Object} data - Job data
   * @returns {Promise<Document>}
   */
  async createJob(data) {
    return this.create({
      jobId: data.jobId,
      workspaceId: data.workspaceId,
      jobType: data.jobType,
      triggeredBy: data.triggeredBy || 'auto',
      userId: data.userId,
      status: 'queued',
      progress: {
        totalDocuments: 0,
        processedDocuments: 0,
        successCount: 0,
        errorCount: 0,
        skippedCount: 0,
      },
      result: {
        documentsAdded: 0,
        documentsUpdated: 0,
        documentsDeleted: 0,
        chunksCreated: 0,
        errors: [],
      },
      metadata: data.metadata,
    });
  }

  /**
   * Start a job
   * @param {string} jobId - Job ID
   * @returns {Promise<Document>}
   */
  async startJob(jobId) {
    return this.updateOne(
      { jobId },
      {
        status: 'processing',
        startedAt: new Date(),
      }
    );
  }

  /**
   * Update job progress
   * @param {string} jobId - Job ID
   * @param {Object} progress - Progress update
   * @returns {Promise<Document>}
   */
  async updateProgress(jobId, progress) {
    return this.updateOne({ jobId }, { $set: { progress } });
  }

  /**
   * Increment progress counters
   * @param {string} jobId - Job ID
   * @param {Object} increments - Fields to increment
   * @returns {Promise<Document>}
   */
  async incrementProgress(jobId, increments) {
    const incObj = {};
    for (const [key, value] of Object.entries(increments)) {
      incObj[`progress.${key}`] = value;
    }
    return this.model.findOneAndUpdate({ jobId }, { $inc: incObj }, { new: true });
  }

  /**
   * Complete a job
   * @param {string} jobId - Job ID
   * @param {Object} result - Job result
   * @returns {Promise<Document>}
   */
  async completeJob(jobId, result = {}) {
    const job = await this.findByJobId(jobId);
    if (!job) return null;

    const completedAt = new Date();
    const duration = job.startedAt ? completedAt - job.startedAt : 0;

    return this.updateOne(
      { jobId },
      {
        status: 'completed',
        completedAt,
        duration,
        result: { ...job.result, ...result },
      }
    );
  }

  /**
   * Fail a job
   * @param {string} jobId - Job ID
   * @param {Error} error - Error object
   * @returns {Promise<Document>}
   */
  async failJob(jobId, error) {
    const job = await this.findByJobId(jobId);
    if (!job) return null;

    const completedAt = new Date();
    const duration = job.startedAt ? completedAt - job.startedAt : completedAt - job.createdAt;

    return this.updateOne(
      { jobId },
      {
        status: 'failed',
        completedAt,
        duration,
        error: {
          message: error.message || error.toString(),
          stack: error.stack,
          timestamp: new Date(),
        },
        $inc: { retryCount: 1 },
      }
    );
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @returns {Promise<Document>}
   */
  async cancelJob(jobId) {
    const job = await this.findByJobId(jobId);
    if (!job) return null;

    const completedAt = new Date();
    const duration = job.startedAt ? completedAt - job.startedAt : 0;

    return this.updateOne(
      { jobId },
      {
        status: 'cancelled',
        completedAt,
        duration,
      }
    );
  }

  /**
   * Add error to job result
   * @param {string} jobId - Job ID
   * @param {string} documentId - Document that failed
   * @param {Error} error - Error object
   * @returns {Promise<Document>}
   */
  async addJobError(jobId, documentId, error) {
    return this.model.findOneAndUpdate(
      { jobId },
      {
        $push: {
          'result.errors': {
            documentId,
            error: error.toString(),
            timestamp: new Date(),
          },
        },
        $inc: { 'progress.errorCount': 1 },
      },
      { new: true }
    );
  }

  /**
   * Get sync statistics for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async getWorkspaceSyncStats(workspaceId) {
    const result = await this.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedJobs: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          avgDuration: { $avg: '$duration' },
          totalDocumentsProcessed: { $sum: '$result.documentsAdded' },
          lastSyncAt: { $max: '$completedAt' },
        },
      },
    ]);

    return (
      result[0] || {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        avgDuration: 0,
        totalDocumentsProcessed: 0,
        lastSyncAt: null,
      }
    );
  }

  /**
   * Clean up old completed jobs
   * @param {number} daysOld - Delete jobs older than this
   * @returns {Promise<Object>} - Delete result
   */
  async cleanupOldJobs(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.deleteMany({
      status: { $in: ['completed', 'cancelled'] },
      completedAt: { $lt: cutoffDate },
    });
  }
}

// Singleton instance for backward compatibility
const syncJobRepository = new SyncJobRepository();

export { SyncJobRepository, syncJobRepository };

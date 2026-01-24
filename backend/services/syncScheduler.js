import 'dotenv/config';
import { notionSyncQueue } from '../config/queue.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import logger from '../config/logger.js';

const SYNC_INTERVAL_HOURS = parseInt(process.env.SYNC_INTERVAL_HOURS) || 6;

/**
 * Sync Scheduler Service
 * Manages scheduled synchronization jobs for Notion workspaces
 */
export class SyncScheduler {
  /**
   * Schedule automatic sync for a workspace
   * @param {string} workspaceId - Notion workspace ID
   * @param {number} intervalHours - Sync interval in hours
   * @returns {Promise<void>}
   */
  async scheduleWorkspaceSync(workspaceId, intervalHours = SYNC_INTERVAL_HOURS) {
    try {
      const jobId = `scheduled-sync-${workspaceId}`;

      // Add repeatable job to queue
      await notionSyncQueue.add(
        'scheduledSync',
        {
          workspaceId,
          syncType: 'incremental',
        },
        {
          repeat: {
            every: intervalHours * 60 * 60 * 1000, // Convert hours to milliseconds
          },
          jobId, // Prevent duplicate jobs
        }
      );

      logger.info(`Scheduled sync for workspace ${workspaceId} every ${intervalHours} hours`);
    } catch (error) {
      logger.error(`Failed to schedule sync for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel scheduled sync for a workspace
   * @param {string} workspaceId - Notion workspace ID
   * @returns {Promise<void>}
   */
  async cancelScheduledSync(workspaceId) {
    try {
      const jobId = `scheduled-sync-${workspaceId}`;

      // Remove repeatable job by key
      const repeatableJobs = await notionSyncQueue.getRepeatableJobs();
      const job = repeatableJobs.find((j) => j.id === jobId);

      if (job) {
        await notionSyncQueue.removeRepeatableByKey(job.key);
        logger.info(`Cancelled scheduled sync for workspace ${workspaceId}`);
      } else {
        logger.warn(`No scheduled sync found for workspace ${workspaceId}`);
      }
    } catch (error) {
      logger.error(`Failed to cancel scheduled sync for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Update sync schedule for a workspace
   * @param {string} workspaceId - Notion workspace ID
   * @param {number} newIntervalHours - New sync interval in hours
   * @returns {Promise<void>}
   */
  async updateSyncSchedule(workspaceId, newIntervalHours) {
    try {
      await this.cancelScheduledSync(workspaceId);
      await this.scheduleWorkspaceSync(workspaceId, newIntervalHours);
      logger.info(
        `Updated sync schedule for workspace ${workspaceId} to ${newIntervalHours} hours`
      );
    } catch (error) {
      logger.error(`Failed to update sync schedule for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize all schedules on server startup
   * Restores scheduled syncs for all active workspaces and triggers initial sync if needed
   * @returns {Promise<void>}
   */
  async initializeAllSchedules() {
    try {
      // Find all workspaces with auto-sync enabled
      const workspaces = await NotionWorkspace.find({
        'syncSettings.autoSync': true,
        syncStatus: { $in: ['active', 'error'] }, // Include error status for retry
      });

      logger.info(`Initializing sync schedules for ${workspaces.length} workspaces`);

      for (const workspace of workspaces) {
        try {
          // Schedule recurring sync
          await this.scheduleWorkspaceSync(
            workspace.workspaceId,
            workspace.syncSettings.syncIntervalHours || SYNC_INTERVAL_HOURS
          );

          // Check if workspace needs initial sync (never synced or synced more than 1 day ago)
          const needsInitialSync =
            !workspace.lastSuccessfulSyncAt ||
            Date.now() - workspace.lastSuccessfulSyncAt.getTime() > 24 * 60 * 60 * 1000;

          if (needsInitialSync) {
            logger.info(
              `Workspace ${workspace.workspaceId} needs initial sync - triggering full sync`
            );
            await this.triggerImmediateSync(workspace.workspaceId, 'full', 'auto');
          } else {
            logger.info(
              `Workspace ${workspace.workspaceId} was recently synced - skipping initial sync`
            );
          }
        } catch (error) {
          logger.error(
            `Failed to initialize schedule for workspace ${workspace.workspaceId}:`,
            error
          );
          // Continue with other workspaces
        }
      }

      logger.info('Sync schedules initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize sync schedules:', error);
      throw error;
    }
  }

  /**
   * Trigger immediate sync for a workspace
   * @param {string} workspaceId - Notion workspace ID
   * @param {string} syncType - 'full' or 'incremental'
   * @param {string} triggeredBy - 'manual', 'auto', or 'webhook'
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Job information
   */
  async triggerImmediateSync(
    workspaceId,
    syncType = 'incremental',
    triggeredBy = 'manual',
    options = {}
  ) {
    try {
      const job = await notionSyncQueue.add(
        'syncNotionWorkspace',
        {
          workspaceId,
          syncType,
          triggeredBy,
          options,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000,
          },
        }
      );

      logger.info(
        `Triggered immediate ${syncType} sync for workspace ${workspaceId}, job ID: ${job.id}`
      );

      return {
        jobId: job.id,
        status: 'queued',
        workspaceId,
        syncType,
        triggeredBy,
      };
    } catch (error) {
      logger.error(`Failed to trigger sync for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Get all scheduled jobs
   * @returns {Promise<Array>} Array of scheduled jobs
   */
  async getScheduledJobs() {
    try {
      const repeatableJobs = await notionSyncQueue.getRepeatableJobs();
      return repeatableJobs;
    } catch (error) {
      logger.error('Failed to get scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   * @param {number} olderThanDays - Remove jobs older than this many days
   * @returns {Promise<void>}
   */
  async cleanOldJobs(olderThanDays = 7) {
    try {
      const timestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      await notionSyncQueue.clean(timestamp, 1000, 'completed');
      await notionSyncQueue.clean(timestamp, 1000, 'failed');
      logger.info(`Cleaned jobs older than ${olderThanDays} days`);
    } catch (error) {
      logger.error('Failed to clean old jobs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();

export default syncScheduler;

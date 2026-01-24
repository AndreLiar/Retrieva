/**
 * Notion Sync Notifications
 *
 * Handles error alerts and notifications for Notion sync worker.
 * Extracted from notionSyncWorker.js for modularity.
 *
 * @module workers/notionSyncNotifications
 */

import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { notificationService } from '../services/notificationService.js';
import { errorAlertService } from '../services/errorAlertService.js';
import { activityFeedService } from '../services/activityFeedService.js';
import logger from '../config/logger.js';

/**
 * Send error alerts based on error type
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Error} error - Error object
 * @param {Object} syncJob - Sync job document
 */
export async function sendErrorAlerts(workspaceId, error, syncJob) {
  const workspace = await NotionWorkspace.findOne({ workspaceId });
  if (!workspace) return;

  const errorMessage = error.message?.toLowerCase() || '';

  // Token expired detection (401 unauthorized)
  if (
    error.status === 401 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('invalid token')
  ) {
    errorAlertService
      .alertTokenExpired(workspaceId, workspace.workspaceName)
      .catch((err) => logger.warn('Failed to send token expired alert', { error: err.message }));
  }
  // Rate limit exceeded
  else if (
    error.status === 429 ||
    errorMessage.includes('rate_limited') ||
    errorMessage.includes('rate limit')
  ) {
    const retryAfter = error.headers?.['retry-after'] || 60;
    errorAlertService
      .alertRateLimitExceeded(workspaceId, workspace.workspaceName, retryAfter)
      .catch((err) => logger.warn('Failed to send rate limit alert', { error: err.message }));
  }
  // General sync failure alert
  else {
    errorAlertService
      .alertSyncFailure(workspaceId, workspace.workspaceName, error.message, {
        phase: 'sync',
        documentsProcessed: syncJob.progress?.processedDocuments || 0,
      })
      .catch((err) => logger.warn('Failed to send sync failure alert', { error: err.message }));
  }

  // Send failure notification to workspace owner
  const workspaceOwner = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    role: 'owner',
    status: 'active',
  });

  if (workspaceOwner) {
    notificationService
      .notifySyncFailed({
        userId: workspaceOwner.userId,
        workspaceId,
        workspaceName: workspace.workspaceName,
        error: error.message,
      })
      .catch((err) => {
        logger.warn('Failed to send sync failure notification', {
          service: 'notion-sync',
          error: err.message,
        });
      });
  }
}

/**
 * Send rate limit warning during sync
 *
 * @param {string} workspaceId - Workspace ID
 * @param {number} documentsProcessed - Documents processed so far
 * @param {number} totalDocuments - Total documents to process
 */
export async function sendRateLimitWarning(workspaceId, documentsProcessed, totalDocuments) {
  const workspace = await NotionWorkspace.findOne({ workspaceId });
  if (!workspace) return;

  errorAlertService
    .alertRateLimitWarning(workspaceId, workspace.workspaceName, {
      percentage: 100,
      documentsProcessed,
      totalDocuments,
    })
    .catch((err) => logger.warn('Failed to send rate limit warning', { error: err.message }));
}

/**
 * Send sync completion notification
 *
 * @param {Object} workspace - Workspace document
 * @param {Object} results - Sync results
 * @param {number} syncDuration - Sync duration in ms
 * @param {number} totalPages - Total pages in Notion
 */
export async function sendCompletionNotification(workspace, results, syncDuration, totalPages) {
  const workspaceOwner = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    role: 'owner',
    status: 'active',
  });

  if (workspaceOwner) {
    notificationService
      .notifySyncCompleted({
        userId: workspaceOwner.userId,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        totalPages,
        successCount: results.documentsAdded + results.documentsUpdated,
        errorCount: results.errors.length,
        duration: syncDuration,
      })
      .catch((err) => {
        logger.warn('Failed to send sync completion notification', {
          service: 'notion-sync',
          error: err.message,
        });
      });
  }
}

/**
 * Log sync activity to activity feed
 *
 * @param {Object} workspace - Workspace document
 * @param {string} activityType - Activity type ('sync_started' or 'sync_completed')
 * @param {Object} data - Activity data
 * @param {string} triggeredBy - Who triggered the sync
 */
export async function logSyncActivity(workspace, activityType, data, triggeredBy) {
  const workspaceOwner = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    role: 'owner',
    status: 'active',
  });

  const activityUserId = triggeredBy === 'auto' ? workspaceOwner?.userId : triggeredBy;

  if (activityUserId) {
    activityFeedService
      .logSyncActivity({
        workspaceId: workspace._id,
        userId: activityUserId,
        activityType,
        data,
      })
      .catch((err) =>
        logger.warn(`Failed to log ${activityType} activity`, { error: err.message })
      );
  }

  return { activityUserId, workspaceOwner };
}

/**
 * Get workspace owner for notifications
 *
 * @param {Object} workspace - Workspace document
 * @returns {Promise<Object|null>} Workspace owner member
 */
export async function getWorkspaceOwner(workspace) {
  return WorkspaceMember.findOne({
    workspaceId: workspace._id,
    role: 'owner',
    status: 'active',
  });
}

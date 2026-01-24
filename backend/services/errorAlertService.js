/**
 * Error Alert Service
 *
 * Centralized service for detecting and alerting on system errors:
 * - Sync failures
 * - Notion token expiration
 * - Rate limit warnings
 * - Index corruption
 * - General system errors
 *
 * @module services/errorAlertService
 */

import { Notification, NotificationTypes, NotificationPriority } from '../models/Notification.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { emitToUser, emitToWorkspace } from './socketService.js';
import { emailService } from './emailService.js';
import logger from '../config/logger.js';

/**
 * Alert Types
 */
export const AlertTypes = {
  SYNC_FAILURE: 'sync_failure',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_EXPIRING_SOON: 'token_expiring_soon',
  RATE_LIMIT_WARNING: 'rate_limit_warning',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INDEX_CORRUPTION: 'index_corruption',
  VECTOR_STORE_ERROR: 'vector_store_error',
  DATABASE_ERROR: 'database_error',
  EXTERNAL_API_ERROR: 'external_api_error',
};

/**
 * Alert severity levels
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

// Track recent alerts to prevent spam
const recentAlerts = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if we should send this alert (rate limiting)
 */
function shouldSendAlert(alertKey) {
  const lastSent = recentAlerts.get(alertKey);
  if (lastSent && Date.now() - lastSent < ALERT_COOLDOWN_MS) {
    return false;
  }
  recentAlerts.set(alertKey, Date.now());
  return true;
}

/**
 * Send alert to workspace owner(s)
 */
async function alertWorkspaceOwner(workspaceId, alert) {
  const owner = await WorkspaceMember.findOne({
    workspaceId,
    role: 'owner',
    status: 'active',
  }).populate('userId', 'name email notificationPreferences');

  if (!owner || !owner.userId) {
    logger.warn('Cannot send alert - workspace owner not found', {
      service: 'error-alert',
      workspaceId,
    });
    return;
  }

  const userId = owner.userId._id;
  const userEmail = owner.userId.email;
  const userName = owner.userId.name;

  // Create notification in database
  const notification = await Notification.createNotification({
    userId,
    type: NotificationTypes.SYSTEM_ALERT,
    title: alert.title,
    message: alert.message,
    priority:
      alert.severity === AlertSeverity.CRITICAL
        ? NotificationPriority.URGENT
        : alert.severity === AlertSeverity.ERROR
          ? NotificationPriority.HIGH
          : NotificationPriority.NORMAL,
    workspaceId,
    data: {
      alertType: alert.type,
      severity: alert.severity,
      details: alert.details,
      timestamp: new Date().toISOString(),
    },
    actionUrl: alert.actionUrl,
    actionLabel: alert.actionLabel,
  });

  // Send via WebSocket
  emitToUser(userId.toString(), 'alert:system', {
    id: notification._id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    workspaceId,
    actionUrl: alert.actionUrl,
    actionLabel: alert.actionLabel,
    timestamp: new Date().toISOString(),
  });

  // Send email for critical/error severity
  if (alert.severity === AlertSeverity.CRITICAL || alert.severity === AlertSeverity.ERROR) {
    try {
      await emailService.sendEmail({
        to: userEmail,
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        html: generateAlertEmailHtml(alert, userName),
      });
      notification.deliveredViaEmail = true;
      await notification.save();
    } catch (emailError) {
      logger.warn('Failed to send alert email', {
        service: 'error-alert',
        error: emailError.message,
      });
    }
  }

  logger.info('Alert sent to workspace owner', {
    service: 'error-alert',
    alertType: alert.type,
    severity: alert.severity,
    workspaceId,
    userId: userId.toString(),
  });

  return notification;
}

/**
 * Generate HTML for alert email
 */
function generateAlertEmailHtml(alert, userName) {
  const severityColor = {
    critical: '#dc2626',
    error: '#ea580c',
    warning: '#ca8a04',
    info: '#2563eb',
  };

  const color = severityColor[alert.severity] || severityColor.info;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${alert.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">

  <div style="background: ${color}; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">${alert.severity.toUpperCase()}: ${alert.title}</h2>
  </div>

  <div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 15px;">Hi ${userName || 'there'},</p>

    <p style="margin: 0 0 20px; color: #374151;">${alert.message}</p>

    ${
      alert.details
        ? `
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
      <h4 style="margin: 0 0 10px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Details</h4>
      <pre style="margin: 0; font-size: 13px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(alert.details, null, 2)}</pre>
    </div>
    `
        : ''
    }

    ${
      alert.actionUrl
        ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${alert.actionUrl}"
         style="background: ${color}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ${alert.actionLabel || 'View Details'}
      </a>
    </div>
    `
        : ''
    }

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
      This is an automated alert from RAG Platform. You received this because you're the workspace owner.
    </p>
  </div>

</body>
</html>
  `;
}

// ============================================================================
// Alert Functions
// ============================================================================

/**
 * Alert: Notion Token Expired
 */
export async function alertTokenExpired(workspaceId, workspaceName) {
  const alertKey = `token_expired:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.TOKEN_EXPIRED,
    severity: AlertSeverity.ERROR,
    title: 'Notion Connection Expired',
    message: `Your Notion connection for "${workspaceName}" has expired. Please reconnect to continue syncing.`,
    actionUrl: `/workspaces/${workspaceId}/settings`,
    actionLabel: 'Reconnect Notion',
    details: { workspaceName },
  });
}

/**
 * Alert: Token Expiring Soon (proactive warning)
 */
export async function alertTokenExpiringSoon(workspaceId, workspaceName, daysUntilExpiry) {
  const alertKey = `token_expiring:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.TOKEN_EXPIRING_SOON,
    severity: AlertSeverity.WARNING,
    title: 'Notion Connection Expiring Soon',
    message: `Your Notion connection for "${workspaceName}" will expire in ${daysUntilExpiry} days. Consider refreshing the connection.`,
    actionUrl: `/workspaces/${workspaceId}/settings`,
    actionLabel: 'Refresh Connection',
    details: { workspaceName, daysUntilExpiry },
  });
}

/**
 * Alert: Rate Limit Warning
 */
export async function alertRateLimitWarning(workspaceId, workspaceName, usage) {
  const alertKey = `rate_limit_warning:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.RATE_LIMIT_WARNING,
    severity: AlertSeverity.WARNING,
    title: 'Approaching Rate Limit',
    message: `Workspace "${workspaceName}" is at ${usage.percentage}% of the rate limit. Sync operations may be slowed.`,
    actionUrl: `/workspaces/${workspaceId}/analytics`,
    actionLabel: 'View Usage',
    details: usage,
  });
}

/**
 * Alert: Rate Limit Exceeded
 */
export async function alertRateLimitExceeded(workspaceId, workspaceName, retryAfter) {
  const alertKey = `rate_limit_exceeded:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.RATE_LIMIT_EXCEEDED,
    severity: AlertSeverity.ERROR,
    title: 'Rate Limit Exceeded',
    message: `Workspace "${workspaceName}" has exceeded the Notion API rate limit. Operations will resume in ${retryAfter} seconds.`,
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: 'View Sync Status',
    details: { retryAfter, workspaceName },
  });
}

/**
 * Alert: Index Corruption Detected
 */
export async function alertIndexCorruption(workspaceId, workspaceName, details) {
  const alertKey = `index_corruption:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.INDEX_CORRUPTION,
    severity: AlertSeverity.CRITICAL,
    title: 'Index Integrity Issue Detected',
    message: `The search index for "${workspaceName}" may have integrity issues. A full re-sync is recommended.`,
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: 'Re-sync Workspace',
    details,
  });
}

/**
 * Alert: Vector Store Error
 */
export async function alertVectorStoreError(workspaceId, workspaceName, error) {
  const alertKey = `vector_store_error:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.VECTOR_STORE_ERROR,
    severity: AlertSeverity.ERROR,
    title: 'Search Index Error',
    message: `There was an error with the search index for "${workspaceName}": ${error}`,
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: 'View Details',
    details: { error },
  });
}

/**
 * Alert: Sync Failure (enhanced version)
 */
export async function alertSyncFailure(workspaceId, workspaceName, error, context = {}) {
  const alertKey = `sync_failure:${workspaceId}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.SYNC_FAILURE,
    severity: AlertSeverity.ERROR,
    title: 'Workspace Sync Failed',
    message: `Failed to sync "${workspaceName}": ${error}`,
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: 'Retry Sync',
    details: {
      error,
      phase: context.phase,
      documentsProcessed: context.documentsProcessed,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Alert: External API Error
 */
export async function alertExternalApiError(workspaceId, workspaceName, apiName, error) {
  const alertKey = `api_error:${workspaceId}:${apiName}`;
  if (!shouldSendAlert(alertKey)) return;

  await alertWorkspaceOwner(workspaceId, {
    type: AlertTypes.EXTERNAL_API_ERROR,
    severity: AlertSeverity.WARNING,
    title: `${apiName} API Error`,
    message: `Error communicating with ${apiName} for workspace "${workspaceName}": ${error}`,
    details: { apiName, error },
  });
}

/**
 * Check Notion token health for a workspace
 * Call this periodically to detect expiring tokens
 */
export async function checkTokenHealth(workspaceId) {
  try {
    const workspace = await NotionWorkspace.findOne({ workspaceId });
    if (!workspace) return;

    // Check if token is about to expire (if we have expiry info)
    if (workspace.tokenExpiresAt) {
      const daysUntilExpiry = Math.ceil(
        (new Date(workspace.tokenExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry <= 0) {
        await alertTokenExpired(workspaceId, workspace.workspaceName);
      } else if (daysUntilExpiry <= 7) {
        await alertTokenExpiringSoon(workspaceId, workspace.workspaceName, daysUntilExpiry);
      }
    }

    // Check last successful sync (if too old, might indicate token issues)
    if (workspace.lastSuccessfulSyncAt) {
      const daysSinceSync = Math.ceil(
        (Date.now() - new Date(workspace.lastSuccessfulSyncAt)) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceSync > 7 && workspace.syncStatus !== 'active') {
        logger.warn('Workspace has not synced successfully in over 7 days', {
          service: 'error-alert',
          workspaceId,
          daysSinceSync,
        });
      }
    }
  } catch (error) {
    logger.error('Error checking token health', {
      service: 'error-alert',
      workspaceId,
      error: error.message,
    });
  }
}

/**
 * Broadcast system-wide alert to all admins
 */
export async function broadcastSystemAlert(title, message, severity = AlertSeverity.WARNING) {
  const { User } = await import('../models/User.js');
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id email name');

  for (const admin of admins) {
    const notification = await Notification.createNotification({
      userId: admin._id,
      type: NotificationTypes.SYSTEM_ALERT,
      title,
      message,
      priority:
        severity === AlertSeverity.CRITICAL
          ? NotificationPriority.URGENT
          : NotificationPriority.HIGH,
      data: { severity, broadcastedAt: new Date().toISOString() },
    });

    emitToUser(admin._id.toString(), 'alert:system', {
      id: notification._id,
      type: 'system_broadcast',
      severity,
      title,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  logger.info('System alert broadcasted to admins', {
    service: 'error-alert',
    title,
    adminCount: admins.length,
  });
}

// Export service
export const errorAlertService = {
  AlertTypes,
  AlertSeverity,
  alertTokenExpired,
  alertTokenExpiringSoon,
  alertRateLimitWarning,
  alertRateLimitExceeded,
  alertIndexCorruption,
  alertVectorStoreError,
  alertSyncFailure,
  alertExternalApiError,
  checkTokenHealth,
  broadcastSystemAlert,
};

export default errorAlertService;

/**
 * Notification Service
 *
 * Centralized service for managing notifications
 * Handles:
 * - Creating and persisting notifications
 * - Real-time delivery via WebSocket
 * - Email delivery (for important notifications)
 * - User preference checking
 *
 * @module services/notificationService
 */

import { Notification, NotificationTypes, NotificationPriority } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emitToUser, isUserOnline } from './socketService.js';
import { emailService } from './emailService.js';
import logger from '../config/logger.js';

/**
 * Default notification preferences
 */
const DEFAULT_PREFERENCES = {
  // In-app notifications (always on by default)
  inApp: {
    workspace_invitation: true,
    workspace_removed: true,
    permission_changed: true,
    member_joined: true,
    member_left: false,
    sync_completed: true,
    sync_failed: true,
    indexing_completed: false,
    indexing_failed: true,
    system_alert: true,
    token_limit_warning: true,
  },
  // Email notifications (selective by default)
  email: {
    workspace_invitation: true,
    workspace_removed: true,
    permission_changed: false,
    sync_failed: true,
    system_alert: true,
    token_limit_reached: true,
  },
  // Push notifications (future)
  push: {
    workspace_invitation: true,
    sync_failed: true,
    system_alert: true,
  },
};

/**
 * Check if user has notification enabled for a type
 * @param {Object} user - User object with notificationPreferences
 * @param {string} type - Notification type
 * @param {string} channel - Channel: 'inApp', 'email', 'push'
 * @returns {boolean}
 */
function isNotificationEnabled(user, type, channel = 'inApp') {
  const prefs = user?.notificationPreferences || DEFAULT_PREFERENCES;
  const channelPrefs = prefs[channel] || DEFAULT_PREFERENCES[channel];

  // If specific preference exists, use it; otherwise default to true for inApp
  if (typeof channelPrefs[type] === 'boolean') {
    return channelPrefs[type];
  }

  // Default behavior: inApp always on, email selective
  return channel === 'inApp';
}

/**
 * Create and deliver a notification
 * @param {Object} options - Notification options
 * @returns {Promise<Object>} Created notification and delivery status
 */
async function createAndDeliver(options) {
  const {
    userId,
    type,
    title,
    message,
    priority = NotificationPriority.NORMAL,
    workspaceId = null,
    actorId = null,
    data = {},
    actionUrl = null,
    actionLabel = null,
    skipPreferenceCheck = false,
  } = options;

  try {
    // Get user to check preferences
    const user = await User.findById(userId).select('email name notificationPreferences');
    if (!user) {
      logger.warn('Cannot create notification - user not found', { userId, type });
      return { success: false, reason: 'User not found' };
    }

    // Check if user wants this notification (unless skipPreferenceCheck)
    if (!skipPreferenceCheck && !isNotificationEnabled(user, type, 'inApp')) {
      logger.debug('Notification skipped - user preference disabled', { userId, type });
      return { success: true, skipped: true, reason: 'User preference disabled' };
    }

    // Create notification in database
    const notification = await Notification.createNotification({
      userId,
      type,
      title,
      message,
      priority,
      workspaceId,
      actorId,
      data,
      actionUrl,
      actionLabel,
    });

    const result = {
      success: true,
      notificationId: notification._id,
      deliveredViaSocket: false,
      deliveredViaEmail: false,
    };

    // Deliver via WebSocket if user is online
    if (isUserOnline(userId.toString())) {
      emitToUser(userId.toString(), 'notification:new', {
        id: notification._id,
        type,
        title,
        message,
        priority,
        workspaceId,
        actorId,
        data,
        actionUrl,
        actionLabel,
        createdAt: notification.createdAt,
      });

      notification.deliveredViaSocket = true;
      await notification.save();
      result.deliveredViaSocket = true;

      logger.debug('Notification delivered via WebSocket', {
        service: 'notification',
        userId: userId.toString(),
        type,
      });
    }

    // Check if email should be sent
    if (isNotificationEnabled(user, type, 'email') && priority !== NotificationPriority.LOW) {
      // Send email for high priority or if user isn't online
      const shouldEmail =
        priority === NotificationPriority.URGENT ||
        priority === NotificationPriority.HIGH ||
        !result.deliveredViaSocket;

      if (shouldEmail) {
        try {
          await sendNotificationEmail(user, notification);
          notification.deliveredViaEmail = true;
          await notification.save();
          result.deliveredViaEmail = true;
        } catch (emailError) {
          logger.warn('Failed to send notification email', {
            service: 'notification',
            userId: userId.toString(),
            error: emailError.message,
          });
        }
      }
    }

    logger.info('Notification created and delivered', {
      service: 'notification',
      notificationId: notification._id.toString(),
      userId: userId.toString(),
      type,
      deliveredViaSocket: result.deliveredViaSocket,
      deliveredViaEmail: result.deliveredViaEmail,
    });

    return result;
  } catch (error) {
    logger.error('Failed to create notification', {
      service: 'notification',
      userId: userId?.toString(),
      type,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send notification via email
 * @param {Object} user - User object
 * @param {Object} notification - Notification object
 */
async function sendNotificationEmail(user, notification) {
  const { type, title, message, actionUrl, actionLabel, data } = notification;

  // Use specific email templates for certain types
  switch (type) {
    case NotificationTypes.WORKSPACE_INVITATION:
      // Already handled by workspaceMemberController
      break;

    case NotificationTypes.SYNC_FAILED:
      await emailService.sendEmail({
        to: user.email,
        subject: `[Action Required] ${title}`,
        html: generateNotificationEmailHtml({
          title,
          message,
          actionUrl,
          actionLabel,
          priority: 'high',
        }),
      });
      break;

    default:
      // Generic notification email
      await emailService.sendEmail({
        to: user.email,
        subject: title,
        html: generateNotificationEmailHtml({
          title,
          message,
          actionUrl,
          actionLabel,
        }),
      });
  }
}

/**
 * Generate HTML for notification email
 */
function generateNotificationEmailHtml({
  title,
  message,
  actionUrl,
  actionLabel,
  priority = 'normal',
}) {
  const buttonColor = priority === 'high' ? '#dc2626' : '#667eea';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">${title}</h1>
  </div>

  <div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      ${message}
    </p>

    ${
      actionUrl && actionLabel
        ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${actionUrl}"
         style="background: ${buttonColor};
                color: white;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;">
        ${actionLabel}
      </a>
    </div>
    `
        : ''
    }

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This notification was sent by Retrieva.<br>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/notifications" style="color: #667eea;">
        Manage notification preferences
      </a>
    </p>
  </div>

</body>
</html>
  `;
}

// ============================================================================
// Convenience Methods for Specific Notification Types
// ============================================================================

/**
 * Send workspace invitation notification
 */
async function notifyWorkspaceInvitation({
  userId,
  workspaceId,
  workspaceName,
  inviterId,
  inviterName,
  role,
}) {
  // Create database notification
  const notification = await Notification.createInvitationNotification({
    userId,
    workspaceId,
    workspaceName,
    inviterId,
    inviterName,
    role,
  });

  // Deliver via WebSocket
  if (isUserOnline(userId.toString())) {
    emitToUser(userId.toString(), 'notification:invitation', {
      id: notification._id,
      type: NotificationTypes.WORKSPACE_INVITATION,
      workspaceId,
      workspaceName,
      inviterName,
      role,
      createdAt: notification.createdAt,
    });

    notification.deliveredViaSocket = true;
    await notification.save();
  }

  logger.info('Workspace invitation notification sent', {
    service: 'notification',
    userId: userId.toString(),
    workspaceName,
  });

  return notification;
}

/**
 * Send permission change notification
 */
async function notifyPermissionChange({
  userId,
  workspaceId,
  workspaceName,
  actorId,
  actorName,
  oldRole,
  newRole,
}) {
  const notification = await Notification.createPermissionChangeNotification({
    userId,
    workspaceId,
    workspaceName,
    actorId,
    actorName,
    oldRole,
    newRole,
  });

  if (isUserOnline(userId.toString())) {
    emitToUser(userId.toString(), 'notification:permission-change', {
      id: notification._id,
      type: NotificationTypes.PERMISSION_CHANGED,
      workspaceId,
      workspaceName,
      oldRole,
      newRole,
      changedBy: actorName,
      createdAt: notification.createdAt,
    });

    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return notification;
}

/**
 * Send workspace removal notification
 */
async function notifyWorkspaceRemoval({ userId, workspaceId, workspaceName, actorId, actorName }) {
  const notification = await Notification.createRemovalNotification({
    userId,
    workspaceId,
    workspaceName,
    actorId,
    actorName,
  });

  if (isUserOnline(userId.toString())) {
    emitToUser(userId.toString(), 'notification:removed', {
      id: notification._id,
      type: NotificationTypes.WORKSPACE_REMOVED,
      workspaceId,
      workspaceName,
      removedBy: actorName,
      createdAt: notification.createdAt,
    });

    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return notification;
}

/**
 * Send sync completed notification to workspace owner
 */
async function notifySyncCompleted({
  userId,
  workspaceId,
  workspaceName,
  totalPages,
  successCount,
  errorCount,
  duration,
}) {
  const notification = await Notification.createSyncCompletedNotification({
    userId,
    workspaceId,
    workspaceName,
    totalPages,
    successCount,
    errorCount,
    duration,
  });

  if (isUserOnline(userId.toString())) {
    emitToUser(userId.toString(), 'notification:new', {
      id: notification._id,
      type: NotificationTypes.SYNC_COMPLETED,
      title: notification.title,
      message: notification.message,
      workspaceId,
      data: { totalPages, successCount, errorCount, duration },
      createdAt: notification.createdAt,
    });

    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return notification;
}

/**
 * Send sync failed notification
 */
async function notifySyncFailed({ userId, workspaceId, workspaceName, error }) {
  const notification = await Notification.createSyncFailedNotification({
    userId,
    workspaceId,
    workspaceName,
    error,
  });

  // Always try to deliver via WebSocket for urgent notifications
  if (isUserOnline(userId.toString())) {
    emitToUser(userId.toString(), 'notification:new', {
      id: notification._id,
      type: NotificationTypes.SYNC_FAILED,
      title: notification.title,
      message: notification.message,
      priority: NotificationPriority.URGENT,
      workspaceId,
      data: { error },
      createdAt: notification.createdAt,
    });

    notification.deliveredViaSocket = true;
    await notification.save();
  }

  // Also send email for failed syncs
  const user = await User.findById(userId).select('email name');
  if (user && isNotificationEnabled(user, NotificationTypes.SYNC_FAILED, 'email')) {
    await sendNotificationEmail(user, notification);
    notification.deliveredViaEmail = true;
    await notification.save();
  }

  return notification;
}

/**
 * Notify all workspace members about an event
 */
async function notifyWorkspaceMembers({
  workspaceId,
  excludeUserId = null,
  type,
  title,
  message,
  data = {},
}) {
  // Import here to avoid circular dependency
  const { WorkspaceMember } = await import('../models/WorkspaceMember.js');

  const members = await WorkspaceMember.find({
    workspaceId,
    status: 'active',
    userId: { $ne: excludeUserId },
  }).select('userId');

  const results = await Promise.all(
    members.map((member) =>
      createAndDeliver({
        userId: member.userId,
        type,
        title,
        message,
        workspaceId,
        data,
      })
    )
  );

  return results;
}

// Export service
export const notificationService = {
  createAndDeliver,
  notifyWorkspaceInvitation,
  notifyPermissionChange,
  notifyWorkspaceRemoval,
  notifySyncCompleted,
  notifySyncFailed,
  notifyWorkspaceMembers,
  isNotificationEnabled,
  DEFAULT_PREFERENCES,
};

export default notificationService;

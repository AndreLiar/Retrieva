/**
 * Notification Service — Monolith Proxy
 *
 * All notification logic is delegated to the standalone notification-service
 * microservice (see /notification-service/). The public API (method names +
 * signatures) is identical to the original, so no callsite in the monolith
 * needs to change.
 *
 * Routing:
 *   NOTIFICATION_SERVICE_URL is set  → HTTP POST via internalClient
 *   NOTIFICATION_SERVICE_URL not set → falls back to in-process logic so the
 *                                      backend works without Docker for local dev.
 *
 * @module services/notificationService
 */

import { internalClient } from '../utils/internalClient.js';
import { Notification, NotificationTypes, NotificationPriority } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emitToUser, isUserOnline } from './socketService.js';
import { emailService } from './emailService.js';
import logger from '../config/logger.js';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL;

// ---------------------------------------------------------------------------
// Remote path (notification-service is running)
// ---------------------------------------------------------------------------

async function callNotificationService(path, payload) {
  return internalClient.post(NOTIFICATION_SERVICE_URL, path, payload).catch((err) => {
    logger.error('Notification service call failed', {
      service: 'notification',
      path,
      error: err.message,
    });
    return { success: false, error: err.message };
  });
}

const remote = {
  createAndDeliver: (p) => callNotificationService('/internal/notify/deliver', p),
  notifyWorkspaceInvitation: (p) =>
    callNotificationService('/internal/notify/workspace-invitation', p),
  notifyPermissionChange: (p) => callNotificationService('/internal/notify/permission-change', p),
  notifyWorkspaceRemoval: (p) => callNotificationService('/internal/notify/workspace-removal', p),
  notifySyncCompleted: (p) => callNotificationService('/internal/notify/sync-completed', p),
  notifySyncFailed: (p) => callNotificationService('/internal/notify/sync-failed', p),
  notifyWorkspaceMembers: (p) => callNotificationService('/internal/notify/workspace-members', p),
  isNotificationEnabled: () => true,
  DEFAULT_PREFERENCES: {
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
    email: {
      workspace_invitation: true,
      workspace_removed: true,
      permission_changed: false,
      sync_failed: true,
      system_alert: true,
      token_limit_reached: true,
    },
  },
};

// ---------------------------------------------------------------------------
// In-process fallback (local dev without docker-compose)
// ---------------------------------------------------------------------------

const DEFAULT_PREFERENCES = {
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
  email: {
    workspace_invitation: true,
    workspace_removed: true,
    permission_changed: false,
    sync_failed: true,
    system_alert: true,
    token_limit_reached: true,
  },
  push: {
    workspace_invitation: true,
    sync_failed: true,
    system_alert: true,
  },
};

function isNotificationEnabled(user, type, channel = 'inApp') {
  const prefs = user?.notificationPreferences || DEFAULT_PREFERENCES;
  const channelPrefs = prefs[channel] || DEFAULT_PREFERENCES[channel];
  if (typeof channelPrefs?.[type] === 'boolean') return channelPrefs[type];
  return channel === 'inApp';
}

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
    const user = await User.findById(userId).select('email name notificationPreferences');
    if (!user) {
      logger.warn('Cannot create notification - user not found', { userId, type });
      return { success: false, reason: 'User not found' };
    }

    if (!skipPreferenceCheck && !isNotificationEnabled(user, type, 'inApp')) {
      logger.debug('Notification skipped - user preference disabled', { userId, type });
      return { success: true, skipped: true, reason: 'User preference disabled' };
    }

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
    }

    if (isNotificationEnabled(user, type, 'email') && priority !== NotificationPriority.LOW) {
      const shouldEmail =
        priority === NotificationPriority.URGENT ||
        priority === NotificationPriority.HIGH ||
        !result.deliveredViaSocket;

      if (shouldEmail) {
        try {
          await _sendNotificationEmail(user, notification);
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

async function _sendNotificationEmail(user, notification) {
  const { type, title, message, actionUrl, actionLabel } = notification;

  switch (type) {
    case NotificationTypes.WORKSPACE_INVITATION:
      break;

    case NotificationTypes.SYNC_FAILED:
      await emailService.sendEmail({
        to: user.email,
        subject: `[Action Required] ${title}`,
        html: _notificationEmailHtml({ title, message, actionUrl, actionLabel, priority: 'high' }),
      });
      break;

    default:
      await emailService.sendEmail({
        to: user.email,
        subject: title,
        html: _notificationEmailHtml({ title, message, actionUrl, actionLabel }),
      });
  }
}

function _notificationEmailHtml({ title, message, actionUrl, actionLabel, priority = 'normal' }) {
  const buttonColor = priority === 'high' ? '#dc2626' : '#667eea';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;"><h1 style="color: white; margin: 0; font-size: 20px;">${title}</h1></div><div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;"><p>${message}</p>${actionUrl && actionLabel ? `<div style="text-align: center; margin: 25px 0;"><a href="${frontendUrl}${actionUrl}" style="background: ${buttonColor}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">${actionLabel}</a></div>` : ''}<hr style="border: none; border-top: 1px solid #e5e7eb;"><p style="font-size: 12px; color: #9ca3af; text-align: center;">This notification was sent by Retrieva.<br><a href="${frontendUrl}/settings/notifications" style="color: #667eea;">Manage preferences</a></p></div></body></html>`;
}

async function notifyWorkspaceInvitation({
  userId,
  workspaceId,
  workspaceName,
  inviterId,
  inviterName,
  role,
}) {
  const notification = await Notification.createInvitationNotification({
    userId,
    workspaceId,
    workspaceName,
    inviterId,
    inviterName,
    role,
  });

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

async function notifySyncFailed({ userId, workspaceId, workspaceName, error }) {
  const notification = await Notification.createSyncFailedNotification({
    userId,
    workspaceId,
    workspaceName,
    error,
  });

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

  const user = await User.findById(userId).select('email name');
  if (user && isNotificationEnabled(user, NotificationTypes.SYNC_FAILED, 'email')) {
    await _sendNotificationEmail(user, notification);
    notification.deliveredViaEmail = true;
    await notification.save();
  }

  return notification;
}

async function notifyWorkspaceMembers({
  workspaceId,
  excludeUserId = null,
  type,
  title,
  message,
  data = {},
}) {
  const { WorkspaceMember } = await import('../models/WorkspaceMember.js');

  const members = await WorkspaceMember.find({
    workspaceId,
    status: 'active',
    userId: { $ne: excludeUserId },
  }).select('userId');

  const results = await Promise.all(
    members.map((member) =>
      createAndDeliver({ userId: member.userId, type, title, message, workspaceId, data })
    )
  );

  return results;
}

const local = {
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

// Use remote proxy when NOTIFICATION_SERVICE_URL is configured, otherwise fall back
// to the in-process logic (no docker-compose required for local dev).
export const notificationService = NOTIFICATION_SERVICE_URL ? remote : local;

if (NOTIFICATION_SERVICE_URL) {
  logger.info('Notification service: using remote microservice', {
    service: 'notification',
    url: NOTIFICATION_SERVICE_URL,
  });
} else {
  logger.info(
    'Notification service: using in-process logic (set NOTIFICATION_SERVICE_URL to use microservice)',
    { service: 'notification' }
  );
}

export default notificationService;

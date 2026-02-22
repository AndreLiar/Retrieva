/**
 * Notification Controller — Monolith Proxy
 *
 * When NOTIFICATION_SERVICE_URL is set, all handlers are thin HTTP proxies
 * that forward the authenticated request to the notification-service.
 * When not set, each handler queries the database directly (local dev fallback).
 *
 * Public API (route names + response format) is identical to the original.
 *
 * @module controllers/notificationController
 */

import { internalClient } from '../utils/internalClient.js';
import { Notification, NotificationTypes } from '../models/Notification.js';
import { User } from '../models/User.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import { notificationService } from '../services/notificationService.js';
import logger from '../config/logger.js';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL;

// ---------------------------------------------------------------------------
// Helpers for remote proxy path
// ---------------------------------------------------------------------------

function userHeader(req) {
  return { 'X-User-Id': req.user.userId };
}

// Forward the notification-service response directly (it already uses our format)
function forwardResponse(res, result) {
  if (!result || typeof result !== 'object') {
    return sendError(res, 502, 'Invalid response from notification service');
  }
  const status = result.success === false ? result.statusCode || 500 : 200;
  return res.status(status).json(result);
}

// ---------------------------------------------------------------------------
// Remote handlers — HTTP proxies to notification-service
// ---------------------------------------------------------------------------

const remoteGetNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, type, unreadOnly } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const qs = new URLSearchParams({ page: String(pageNum), limit: String(limitNum) });
  if (type) qs.set('type', type);
  if (unreadOnly) qs.set('unreadOnly', String(unreadOnly));
  const result = await internalClient.get(
    NOTIFICATION_SERVICE_URL,
    `/internal/notifications?${qs}`,
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteGetUnreadCount = catchAsync(async (req, res) => {
  const result = await internalClient.get(
    NOTIFICATION_SERVICE_URL,
    '/internal/notifications/count',
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteGetPreferences = catchAsync(async (req, res) => {
  const result = await internalClient.get(
    NOTIFICATION_SERVICE_URL,
    '/internal/notifications/preferences',
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteUpdatePreferences = catchAsync(async (req, res) => {
  const result = await internalClient.put(
    NOTIFICATION_SERVICE_URL,
    '/internal/notifications/preferences',
    req.body,
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteGetNotificationTypes = catchAsync(async (req, res) => {
  const result = await internalClient.get(
    NOTIFICATION_SERVICE_URL,
    '/internal/notifications/types',
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteMarkAsRead = catchAsync(async (req, res) => {
  const result = await internalClient.post(
    NOTIFICATION_SERVICE_URL,
    '/internal/notifications/read',
    req.body,
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteMarkOneAsRead = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const result = await internalClient.post(
    NOTIFICATION_SERVICE_URL,
    `/internal/notifications/${notificationId}/mark-read`,
    {},
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

const remoteDeleteNotification = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const result = await internalClient.delete(
    NOTIFICATION_SERVICE_URL,
    `/internal/notifications/${notificationId}`,
    { headers: userHeader(req) }
  );
  return forwardResponse(res, result);
});

// ---------------------------------------------------------------------------
// Local handlers — in-process DB queries (no docker-compose required)
// ---------------------------------------------------------------------------

function formatNotification(notification) {
  const n = notification.toObject ? notification.toObject() : notification;
  return {
    id: n._id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    isRead: n.isRead,
    readAt: n.readAt,
    workspaceId: n.workspaceId?._id || n.workspaceId,
    workspaceName: n.workspaceId?.workspaceName,
    actor: n.actorId
      ? { id: n.actorId._id || n.actorId, name: n.actorId.name, email: n.actorId.email }
      : null,
    data: n.data,
    actionUrl: n.actionUrl,
    actionLabel: n.actionLabel,
    createdAt: n.createdAt,
  };
}

function getTypeDescription(type) {
  const descriptions = {
    workspace_invitation: 'When you are invited to a workspace',
    workspace_removed: 'When you are removed from a workspace',
    permission_changed: 'When your workspace permissions change',
    member_joined: 'When a new member joins your workspace',
    member_left: 'When a member leaves your workspace',
    sync_started: 'When a workspace sync starts',
    sync_completed: 'When a workspace sync completes',
    sync_failed: 'When a workspace sync fails',
    indexing_completed: 'When document indexing completes',
    indexing_failed: 'When document indexing fails',
    system_alert: 'Important system notifications',
    system_maintenance: 'Scheduled maintenance notifications',
    token_limit_warning: 'When approaching usage limits',
    token_limit_reached: 'When usage limits are reached',
  };
  return descriptions[type] || type;
}

const localGetNotifications = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20, type = null, unreadOnly = false } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

  const result = await Notification.getForUser(userId, {
    page: pageNum,
    limit: limitNum,
    type: type || null,
    unreadOnly: unreadOnly === 'true' || unreadOnly === true,
  });

  sendSuccess(res, 200, 'Notifications retrieved', {
    notifications: result.notifications.map(formatNotification),
    pagination: {
      page: result.page,
      limit: limitNum,
      total: result.total,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
    },
  });
});

const localGetUnreadCount = catchAsync(async (req, res) => {
  const count = await Notification.getUnreadCount(req.user.userId);
  sendSuccess(res, 200, 'Unread count retrieved', { unreadCount: count });
});

const localGetPreferences = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.userId).select('notificationPreferences');
  if (!user) return sendError(res, 404, 'User not found');

  const preferences = {
    inApp: {
      ...notificationService.DEFAULT_PREFERENCES.inApp,
      ...user.notificationPreferences?.inApp,
    },
    email: {
      ...notificationService.DEFAULT_PREFERENCES.email,
      ...user.notificationPreferences?.email,
    },
  };

  sendSuccess(res, 200, 'Preferences retrieved', { preferences });
});

const localUpdatePreferences = catchAsync(async (req, res) => {
  const { inApp, email } = req.body;
  const user = await User.findById(req.user.userId);
  if (!user) return sendError(res, 404, 'User not found');

  if (!user.notificationPreferences) user.notificationPreferences = { inApp: {}, email: {} };

  if (inApp && typeof inApp === 'object') {
    for (const [key, value] of Object.entries(inApp)) {
      if (typeof value === 'boolean') user.notificationPreferences.inApp[key] = value;
    }
  }
  if (email && typeof email === 'object') {
    for (const [key, value] of Object.entries(email)) {
      if (typeof value === 'boolean') user.notificationPreferences.email[key] = value;
    }
  }

  user.markModified('notificationPreferences');
  await user.save();

  logger.info('Notification preferences updated', {
    service: 'notification',
    userId: req.user.userId.toString(),
  });

  sendSuccess(res, 200, 'Preferences updated', { preferences: user.notificationPreferences });
});

const localGetNotificationTypes = catchAsync(async (req, res) => {
  const types = Object.entries(NotificationTypes).map(([key, value]) => ({
    key,
    value,
    description: getTypeDescription(value),
  }));
  sendSuccess(res, 200, 'Notification types retrieved', { types });
});

const localMarkAsRead = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { notificationIds, all = false } = req.body;

  let result;
  if (all === true) {
    result = await Notification.markAllAsRead(userId);
    logger.info('All notifications marked as read', {
      service: 'notification',
      userId: userId.toString(),
      count: result.modified,
    });
  } else if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
    result = await Notification.markAsRead(userId, notificationIds);
    logger.info('Notifications marked as read', {
      service: 'notification',
      userId: userId.toString(),
      notificationIds,
      count: result.modified,
    });
  } else {
    return sendError(res, 400, 'Either notificationIds array or all:true is required');
  }

  sendSuccess(res, 200, 'Notifications marked as read', { modifiedCount: result.modified });
});

const localMarkOneAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    userId: req.user.userId,
  });
  if (!notification) return sendError(res, 404, 'Notification not found');
  await notification.markAsRead();
  sendSuccess(res, 200, 'Notification marked as read', {
    notification: formatNotification(notification),
  });
});

const localDeleteNotification = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.notificationId,
    userId: req.user.userId,
  });
  if (!notification) return sendError(res, 404, 'Notification not found');

  logger.info('Notification deleted', {
    service: 'notification',
    userId: req.user.userId.toString(),
    notificationId: req.params.notificationId,
  });

  sendSuccess(res, 200, 'Notification deleted');
});

// ---------------------------------------------------------------------------
// Exports — choose remote or local based on env
// ---------------------------------------------------------------------------

export const getNotifications = NOTIFICATION_SERVICE_URL
  ? remoteGetNotifications
  : localGetNotifications;
export const getUnreadCount = NOTIFICATION_SERVICE_URL ? remoteGetUnreadCount : localGetUnreadCount;
export const getPreferences = NOTIFICATION_SERVICE_URL ? remoteGetPreferences : localGetPreferences;
export const updatePreferences = NOTIFICATION_SERVICE_URL
  ? remoteUpdatePreferences
  : localUpdatePreferences;
export const getNotificationTypes = NOTIFICATION_SERVICE_URL
  ? remoteGetNotificationTypes
  : localGetNotificationTypes;
export const markAsRead = NOTIFICATION_SERVICE_URL ? remoteMarkAsRead : localMarkAsRead;
export const markOneAsRead = NOTIFICATION_SERVICE_URL ? remoteMarkOneAsRead : localMarkOneAsRead;
export const deleteNotification = NOTIFICATION_SERVICE_URL
  ? remoteDeleteNotification
  : localDeleteNotification;

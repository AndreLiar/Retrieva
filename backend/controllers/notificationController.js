/**
 * Notification Controller
 *
 * Handles notification-related API endpoints:
 * - Get user's notifications
 * - Mark notifications as read
 * - Get/Update notification preferences
 * - Get unread count
 *
 * @module controllers/notificationController
 */

import { Notification, NotificationTypes } from '../models/Notification.js';
import { User } from '../models/User.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import { notificationService } from '../services/notificationService.js';
import logger from '../config/logger.js';

/**
 * Get user's notifications (paginated)
 * GET /api/v1/notifications
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 50)
 * - type: Filter by notification type
 * - unreadOnly: Only return unread notifications (default: false)
 */
export const getNotifications = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20, type = null, unreadOnly = false } = req.query;

  // Validate and sanitize params
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

/**
 * Get unread notification count
 * GET /api/v1/notifications/count
 */
export const getUnreadCount = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const count = await Notification.getUnreadCount(userId);

  sendSuccess(res, 200, 'Unread count retrieved', { unreadCount: count });
});

/**
 * Mark notifications as read
 * POST /api/v1/notifications/read
 *
 * Body:
 * - notificationIds: Array of notification IDs to mark as read
 * - all: boolean - Mark all notifications as read
 */
export const markAsRead = catchAsync(async (req, res) => {
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

  sendSuccess(res, 200, 'Notifications marked as read', {
    modifiedCount: result.modified,
  });
});

/**
 * Mark a single notification as read
 * PATCH /api/v1/notifications/:notificationId/read
 */
export const markOneAsRead = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    userId,
  });

  if (!notification) {
    return sendError(res, 404, 'Notification not found');
  }

  await notification.markAsRead();

  sendSuccess(res, 200, 'Notification marked as read', {
    notification: formatNotification(notification),
  });
});

/**
 * Delete a notification
 * DELETE /api/v1/notifications/:notificationId
 */
export const deleteNotification = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { notificationId } = req.params;

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    userId,
  });

  if (!notification) {
    return sendError(res, 404, 'Notification not found');
  }

  logger.info('Notification deleted', {
    service: 'notification',
    userId: userId.toString(),
    notificationId,
  });

  sendSuccess(res, 200, 'Notification deleted');
});

/**
 * Get notification preferences
 * GET /api/v1/notifications/preferences
 */
export const getPreferences = catchAsync(async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId).select('notificationPreferences');
  if (!user) {
    return sendError(res, 404, 'User not found');
  }

  // Merge user preferences with defaults
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

/**
 * Update notification preferences
 * PUT /api/v1/notifications/preferences
 *
 * Body:
 * {
 *   inApp: { notification_type: boolean },
 *   email: { notification_type: boolean }
 * }
 */
export const updatePreferences = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { inApp, email } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 404, 'User not found');
  }

  // Initialize preferences if not exists
  if (!user.notificationPreferences) {
    user.notificationPreferences = { inApp: {}, email: {} };
  }

  // Update inApp preferences
  if (inApp && typeof inApp === 'object') {
    for (const [key, value] of Object.entries(inApp)) {
      if (typeof value === 'boolean') {
        user.notificationPreferences.inApp[key] = value;
      }
    }
  }

  // Update email preferences
  if (email && typeof email === 'object') {
    for (const [key, value] of Object.entries(email)) {
      if (typeof value === 'boolean') {
        user.notificationPreferences.email[key] = value;
      }
    }
  }

  user.markModified('notificationPreferences');
  await user.save();

  logger.info('Notification preferences updated', {
    service: 'notification',
    userId: userId.toString(),
  });

  sendSuccess(res, 200, 'Preferences updated', {
    preferences: user.notificationPreferences,
  });
});

/**
 * Get available notification types
 * GET /api/v1/notifications/types
 */
export const getNotificationTypes = catchAsync(async (req, res) => {
  const types = Object.entries(NotificationTypes).map(([key, value]) => ({
    key,
    value,
    description: getTypeDescription(value),
  }));

  sendSuccess(res, 200, 'Notification types retrieved', { types });
});

/**
 * Format notification for API response
 */
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
      ? {
          id: n.actorId._id || n.actorId,
          name: n.actorId.name,
          email: n.actorId.email,
        }
      : null,
    data: n.data,
    actionUrl: n.actionUrl,
    actionLabel: n.actionLabel,
    createdAt: n.createdAt,
  };
}

/**
 * Get human-readable description for notification type
 */
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

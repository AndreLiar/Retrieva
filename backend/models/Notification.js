/**
 * Notification Model
 *
 * Persists in-app notifications for users
 * Supports various notification types:
 * - Workspace invitations
 * - Permission changes
 * - Sync completion
 * - System alerts
 *
 * @module models/Notification
 */

import mongoose from 'mongoose';

/**
 * Notification types enum
 */
export const NotificationTypes = {
  // Workspace collaboration
  WORKSPACE_INVITATION: 'workspace_invitation',
  WORKSPACE_REMOVED: 'workspace_removed',
  PERMISSION_CHANGED: 'permission_changed',
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',

  // Sync notifications
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Document indexing
  INDEXING_COMPLETED: 'indexing_completed',
  INDEXING_FAILED: 'indexing_failed',

  // System notifications
  SYSTEM_ALERT: 'system_alert',
  SYSTEM_MAINTENANCE: 'system_maintenance',

  // Query/Usage notifications
  TOKEN_LIMIT_WARNING: 'token_limit_warning',
  TOKEN_LIMIT_REACHED: 'token_limit_reached',
};

/**
 * Notification priority levels
 */
export const NotificationPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

const notificationSchema = new mongoose.Schema(
  {
    // Target user for this notification
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Notification type (from NotificationTypes enum)
    type: {
      type: String,
      required: true,
      index: true,
    },

    // Human-readable title
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },

    // Detailed message
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    // Priority level
    priority: {
      type: String,
      enum: Object.values(NotificationPriority),
      default: NotificationPriority.NORMAL,
    },

    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Timestamp when read
    readAt: {
      type: Date,
    },

    // Associated workspace (if applicable)
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotionWorkspace',
      index: true,
    },

    // Actor who triggered the notification (if applicable)
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Additional data specific to notification type
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Action URL/deep link (optional)
    actionUrl: {
      type: String,
    },

    // Action label (e.g., "View Workspace", "Retry Sync")
    actionLabel: {
      type: String,
    },

    // Whether notification was delivered via WebSocket
    deliveredViaSocket: {
      type: Boolean,
      default: false,
    },

    // Whether notification was delivered via email
    deliveredViaEmail: {
      type: Boolean,
      default: false,
    },

    // Expiration date (for time-sensitive notifications)
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// TTL index for auto-deletion of expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Mark notification as read
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markAsRead = async function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * Mark notification as delivered via socket
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markDeliveredViaSocket = async function () {
  this.deliveredViaSocket = true;
  await this.save();
  return this;
};

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Get unread notifications for a user
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Notification[]>}
 */
notificationSchema.statics.getUnreadForUser = async function (userId, options = {}) {
  const { limit = 50, type = null } = options;

  const query = { userId, isRead: false };
  if (type) query.type = type;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorId', 'name email')
    .populate('workspaceId', 'workspaceName workspaceIcon');
};

/**
 * Get all notifications for a user (paginated)
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<{notifications: Notification[], total: number, hasMore: boolean}>}
 */
notificationSchema.statics.getForUser = async function (userId, options = {}) {
  const { page = 1, limit = 20, type = null, unreadOnly = false } = options;
  const skip = (page - 1) * limit;

  const query = { userId };
  if (type) query.type = type;
  if (unreadOnly) query.isRead = false;

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'name email')
      .populate('workspaceId', 'workspaceName workspaceIcon'),
    this.countDocuments(query),
  ]);

  return {
    notifications,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + notifications.length < total,
  };
};

/**
 * Get unread count for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<number>}
 */
notificationSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({ userId, isRead: false });
};

/**
 * Mark all notifications as read for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<{modified: number}>}
 */
notificationSchema.statics.markAllAsRead = async function (userId) {
  const result = await this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount };
};

/**
 * Mark specific notifications as read
 * @param {ObjectId} userId - User ID
 * @param {ObjectId[]} notificationIds - Notification IDs to mark as read
 * @returns {Promise<{modified: number}>}
 */
notificationSchema.statics.markAsRead = async function (userId, notificationIds) {
  const result = await this.updateMany(
    { _id: { $in: notificationIds }, userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount };
};

/**
 * Delete old read notifications (cleanup)
 * @param {number} daysOld - Delete notifications older than this
 * @returns {Promise<{deleted: number}>}
 */
notificationSchema.statics.cleanupOldNotifications = async function (daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    isRead: true,
    createdAt: { $lt: cutoffDate },
  });

  return { deleted: result.deletedCount };
};

/**
 * Create a notification with common defaults
 * @param {Object} data - Notification data
 * @returns {Promise<Notification>}
 */
notificationSchema.statics.createNotification = async function (data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

// ============================================================================
// Factory Methods for Common Notification Types
// ============================================================================

/**
 * Create workspace invitation notification
 */
notificationSchema.statics.createInvitationNotification = async function ({
  userId,
  workspaceId,
  workspaceName,
  inviterId,
  inviterName,
  role,
}) {
  return this.createNotification({
    userId,
    type: NotificationTypes.WORKSPACE_INVITATION,
    title: 'Workspace Invitation',
    message: `${inviterName} invited you to join "${workspaceName}" as a ${role}`,
    priority: NotificationPriority.HIGH,
    workspaceId,
    actorId: inviterId,
    data: { role, workspaceName },
    actionUrl: `/workspaces/${workspaceId}`,
    actionLabel: 'View Workspace',
  });
};

/**
 * Create permission change notification
 */
notificationSchema.statics.createPermissionChangeNotification = async function ({
  userId,
  workspaceId,
  workspaceName,
  actorId,
  actorName,
  oldRole,
  newRole,
}) {
  return this.createNotification({
    userId,
    type: NotificationTypes.PERMISSION_CHANGED,
    title: 'Permission Updated',
    message: `Your role in "${workspaceName}" was changed from ${oldRole} to ${newRole} by ${actorName}`,
    priority: NotificationPriority.NORMAL,
    workspaceId,
    actorId,
    data: { oldRole, newRole },
    actionUrl: `/workspaces/${workspaceId}`,
    actionLabel: 'View Workspace',
  });
};

/**
 * Create workspace removal notification
 */
notificationSchema.statics.createRemovalNotification = async function ({
  userId,
  workspaceId,
  workspaceName,
  actorId,
  actorName,
}) {
  return this.createNotification({
    userId,
    type: NotificationTypes.WORKSPACE_REMOVED,
    title: 'Removed from Workspace',
    message: `You were removed from "${workspaceName}" by ${actorName}`,
    priority: NotificationPriority.HIGH,
    workspaceId,
    actorId,
    data: { workspaceName },
  });
};

/**
 * Create sync completed notification
 */
notificationSchema.statics.createSyncCompletedNotification = async function ({
  userId,
  workspaceId,
  workspaceName,
  totalPages,
  successCount,
  errorCount,
  duration,
}) {
  const hasErrors = errorCount > 0;
  return this.createNotification({
    userId,
    type: NotificationTypes.SYNC_COMPLETED,
    title: hasErrors ? 'Sync Completed with Errors' : 'Sync Completed',
    message: `Synced ${successCount}/${totalPages} pages from "${workspaceName}" in ${Math.round(duration / 1000)}s${hasErrors ? `. ${errorCount} errors occurred.` : ''}`,
    priority: hasErrors ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
    workspaceId,
    data: { totalPages, successCount, errorCount, duration },
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: hasErrors ? 'View Errors' : 'View Details',
  });
};

/**
 * Create sync failed notification
 */
notificationSchema.statics.createSyncFailedNotification = async function ({
  userId,
  workspaceId,
  workspaceName,
  error,
}) {
  return this.createNotification({
    userId,
    type: NotificationTypes.SYNC_FAILED,
    title: 'Sync Failed',
    message: `Failed to sync "${workspaceName}": ${error}`,
    priority: NotificationPriority.URGENT,
    workspaceId,
    data: { error },
    actionUrl: `/workspaces/${workspaceId}/sync`,
    actionLabel: 'Retry Sync',
  });
};

export const Notification = mongoose.model('Notification', notificationSchema);

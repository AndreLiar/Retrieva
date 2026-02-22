/**
 * Retrieva Notification Service
 *
 * Standalone microservice extracted from:
 *   backend/services/notificationService.js (558 LOC)
 *   backend/models/Notification.js          (435 LOC)
 *   backend/controllers/notificationController.js (303 LOC)
 *
 * Endpoints:
 *
 *   GET  /health                                        — liveness probe
 *
 *   CRUD (proxied from monolith notificationController):
 *   GET    /internal/notifications                      — list for user
 *   GET    /internal/notifications/count                — unread count
 *   GET    /internal/notifications/preferences          — get preferences
 *   PUT    /internal/notifications/preferences          — update preferences
 *   GET    /internal/notifications/types                — static type list
 *   POST   /internal/notifications/read                 — mark batch as read
 *   POST   /internal/notifications/:id/mark-read        — mark one as read
 *   DELETE /internal/notifications/:id                  — delete
 *
 *   Service calls (proxied from monolith notificationService):
 *   POST   /internal/notify/deliver                     — createAndDeliver
 *   POST   /internal/notify/workspace-invitation        — notifyWorkspaceInvitation
 *   POST   /internal/notify/permission-change           — notifyPermissionChange
 *   POST   /internal/notify/workspace-removal           — notifyWorkspaceRemoval
 *   POST   /internal/notify/sync-completed              — notifySyncCompleted
 *   POST   /internal/notify/sync-failed                 — notifySyncFailed
 *   POST   /internal/notify/workspace-members           — notifyWorkspaceMembers
 *
 * Security: set INTERNAL_API_KEY in both this service and the caller;
 * the monolith's internalClient forwards X-Internal-Api-Key on every call.
 */

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import IORedis from 'ioredis';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT) || 3009;
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const EMAIL_SERVICE_URL = (process.env.EMAIL_SERVICE_URL || '').replace(/\/$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// MongoDB — shared Atlas cluster, same DB as monolith
// ---------------------------------------------------------------------------

async function connectDB() {
  if (!MONGODB_URI) {
    console.error('[notification-service] MONGODB_URI not set — cannot start');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  console.log('[notification-service] MongoDB connected');
}

// ---------------------------------------------------------------------------
// Notification types & priority enums
// ---------------------------------------------------------------------------

const NotificationTypes = {
  WORKSPACE_INVITATION: 'workspace_invitation',
  WORKSPACE_REMOVED: 'workspace_removed',
  PERMISSION_CHANGED: 'permission_changed',
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',
  INDEXING_COMPLETED: 'indexing_completed',
  INDEXING_FAILED: 'indexing_failed',
  SYSTEM_ALERT: 'system_alert',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  TOKEN_LIMIT_WARNING: 'token_limit_warning',
  TOKEN_LIMIT_REACHED: 'token_limit_reached',
};

const NotificationPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

// ---------------------------------------------------------------------------
// Mongoose models
// ---------------------------------------------------------------------------

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    priority: {
      type: String,
      enum: Object.values(NotificationPriority),
      default: NotificationPriority.NORMAL,
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotionWorkspace', index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    actionUrl: { type: String },
    actionLabel: { type: String },
    deliveredViaSocket: { type: Boolean, default: false },
    deliveredViaEmail: { type: Boolean, default: false },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

notificationSchema.methods.markAsRead = async function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

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

notificationSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({ userId, isRead: false });
};

notificationSchema.statics.markAllAsRead = async function (userId) {
  const result = await this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount };
};

notificationSchema.statics.markAsRead = async function (userId, notificationIds) {
  const result = await this.updateMany(
    { _id: { $in: notificationIds }, userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount };
};

notificationSchema.statics.createNotification = async function (data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

notificationSchema.statics.createInvitationNotification = async function ({
  userId, workspaceId, workspaceName, inviterId, inviterName, role,
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

notificationSchema.statics.createPermissionChangeNotification = async function ({
  userId, workspaceId, workspaceName, actorId, actorName, oldRole, newRole,
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

notificationSchema.statics.createRemovalNotification = async function ({
  userId, workspaceId, workspaceName, actorId, actorName,
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

notificationSchema.statics.createSyncCompletedNotification = async function ({
  userId, workspaceId, workspaceName, totalPages, successCount, errorCount, duration,
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

notificationSchema.statics.createSyncFailedNotification = async function ({
  userId, workspaceId, workspaceName, error,
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

const Notification = mongoose.model('Notification', notificationSchema);

// Minimal User model — only fields this service needs
const userSchema = new mongoose.Schema(
  {
    email: { type: String },
    name: { type: String },
    notificationPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: false }
);

const User = mongoose.model('User', userSchema);

// Minimal WorkspaceMember model — for notifyWorkspaceMembers
const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    status: { type: String },
  },
  { strict: false }
);

const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);

// ---------------------------------------------------------------------------
// Default notification preferences
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
};

function isNotificationEnabled(user, type, channel = 'inApp') {
  const prefs = user?.notificationPreferences || DEFAULT_PREFERENCES;
  const channelPrefs = prefs[channel] || DEFAULT_PREFERENCES[channel];
  if (typeof channelPrefs?.[type] === 'boolean') return channelPrefs[type];
  return channel === 'inApp';
}

// ---------------------------------------------------------------------------
// Redis — publish realtime events so the socket layer delivers them
// In Phase 2a: monolith's _initRealtimeSubscriber() picks up and delivers.
// In Phase 2b: realtime-service picks up and delivers.
// ---------------------------------------------------------------------------

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on('error', (err) => {
      console.error('[notification-service] Redis error:', err.message);
    });
  }
  return redis;
}

async function publishRealtimeEvent(userId, event, data) {
  try {
    await getRedis().publish(`realtime:user:${userId}`, JSON.stringify({ event, data }));
  } catch (err) {
    console.error('[notification-service] Failed to publish realtime event:', err.message);
  }
}

/**
 * Check if user is currently online by reading the presence hash written by
 * realtime-service. In Phase 2a (before realtime-service is deployed) this
 * will always return false — email is sent as fallback.
 */
async function isUserOnline(userId) {
  try {
    const status = await getRedis().hget(`presence:user:${userId}`, 'status');
    return status === 'online' || status === 'away';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email client — calls email-service via HTTP
// ---------------------------------------------------------------------------

async function sendEmail(payload) {
  if (!EMAIL_SERVICE_URL) {
    console.warn('[notification-service] EMAIL_SERVICE_URL not set — skipping email');
    return { success: false, reason: 'not-configured' };
  }

  const headers = { 'Content-Type': 'application/json', 'X-Service-Name': 'notification-service' };
  if (INTERNAL_API_KEY) headers['X-Internal-Api-Key'] = INTERNAL_API_KEY;

  try {
    const resp = await fetch(`${EMAIL_SERVICE_URL}/internal/email/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok ? resp.json() : { success: false, error: `email-service ${resp.status}` };
  } catch (err) {
    console.error('[notification-service] Email send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Notification email HTML generator
// ---------------------------------------------------------------------------

function notificationEmailHtml({ title, message, actionUrl, actionLabel, priority = 'normal' }) {
  const buttonColor = priority === 'high' || priority === 'urgent' ? '#dc2626' : '#667eea';
  const fullActionUrl = actionUrl ? `${FRONTEND_URL}${actionUrl}` : null;

  return `<!DOCTYPE html>
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
    <p style="font-size: 16px; margin-bottom: 20px;">${message}</p>
    ${fullActionUrl && actionLabel ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${fullActionUrl}"
         style="background: ${buttonColor}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
        ${actionLabel}
      </a>
    </div>` : ''}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This notification was sent by Retrieva.<br>
      <a href="${FRONTEND_URL}/settings/notifications" style="color: #667eea;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Core notification logic
// ---------------------------------------------------------------------------

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
      console.warn(`[notification-service] createAndDeliver: user not found ${userId}`);
      return { success: false, reason: 'User not found' };
    }

    if (!skipPreferenceCheck && !isNotificationEnabled(user, type, 'inApp')) {
      return { success: true, skipped: true, reason: 'User preference disabled' };
    }

    const notification = await Notification.createNotification({
      userId, type, title, message, priority, workspaceId, actorId, data, actionUrl, actionLabel,
    });

    const result = {
      success: true,
      notificationId: notification._id,
      deliveredViaSocket: false,
      deliveredViaEmail: false,
    };

    // Publish to Redis — socket layer delivers it (queues if user is offline)
    await publishRealtimeEvent(userId.toString(), 'notification:new', {
      id: notification._id,
      type, title, message, priority, workspaceId, actorId, data, actionUrl, actionLabel,
      createdAt: notification.createdAt,
    });

    // Check online status for email decision
    const online = await isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await notification.save();
      result.deliveredViaSocket = true;
    }

    // Email for important notifications or when offline
    if (isNotificationEnabled(user, type, 'email') && priority !== NotificationPriority.LOW) {
      const shouldEmail =
        priority === NotificationPriority.URGENT ||
        priority === NotificationPriority.HIGH ||
        !result.deliveredViaSocket;

      if (shouldEmail) {
        const emailHtml = notificationEmailHtml({ title, message, actionUrl, actionLabel, priority });
        const emailResult = await sendEmail({ to: user.email, subject: type === NotificationTypes.SYNC_FAILED ? `[Action Required] ${title}` : title, html: emailHtml });
        if (emailResult.success) {
          notification.deliveredViaEmail = true;
          await notification.save();
          result.deliveredViaEmail = true;
        }
      }
    }

    console.log(`[notification-service] Delivered: ${type} for user ${userId} socket=${result.deliveredViaSocket} email=${result.deliveredViaEmail}`);
    return result;
  } catch (error) {
    console.error('[notification-service] createAndDeliver failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function notifyWorkspaceInvitation({ userId, workspaceId, workspaceName, inviterId, inviterName, role }) {
  const notification = await Notification.createInvitationNotification({
    userId, workspaceId, workspaceName, inviterId, inviterName, role,
  });

  await publishRealtimeEvent(userId.toString(), 'notification:invitation', {
    id: notification._id,
    type: NotificationTypes.WORKSPACE_INVITATION,
    workspaceId, workspaceName, inviterName, role,
    createdAt: notification.createdAt,
  });

  const online = await isUserOnline(userId.toString());
  if (online) {
    notification.deliveredViaSocket = true;
    await notification.save();
  }

  console.log(`[notification-service] Workspace invitation sent to user ${userId}`);
  return { success: true, notificationId: notification._id };
}

async function notifyPermissionChange({ userId, workspaceId, workspaceName, actorId, actorName, oldRole, newRole }) {
  const notification = await Notification.createPermissionChangeNotification({
    userId, workspaceId, workspaceName, actorId, actorName, oldRole, newRole,
  });

  await publishRealtimeEvent(userId.toString(), 'notification:permission-change', {
    id: notification._id,
    type: NotificationTypes.PERMISSION_CHANGED,
    workspaceId, workspaceName, oldRole, newRole, changedBy: actorName,
    createdAt: notification.createdAt,
  });

  const online = await isUserOnline(userId.toString());
  if (online) {
    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return { success: true, notificationId: notification._id };
}

async function notifyWorkspaceRemoval({ userId, workspaceId, workspaceName, actorId, actorName }) {
  const notification = await Notification.createRemovalNotification({
    userId, workspaceId, workspaceName, actorId, actorName,
  });

  await publishRealtimeEvent(userId.toString(), 'notification:removed', {
    id: notification._id,
    type: NotificationTypes.WORKSPACE_REMOVED,
    workspaceId, workspaceName, removedBy: actorName,
    createdAt: notification.createdAt,
  });

  const online = await isUserOnline(userId.toString());
  if (online) {
    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return { success: true, notificationId: notification._id };
}

async function notifySyncCompleted({ userId, workspaceId, workspaceName, totalPages, successCount, errorCount, duration }) {
  const notification = await Notification.createSyncCompletedNotification({
    userId, workspaceId, workspaceName, totalPages, successCount, errorCount, duration,
  });

  await publishRealtimeEvent(userId.toString(), 'notification:new', {
    id: notification._id,
    type: NotificationTypes.SYNC_COMPLETED,
    title: notification.title,
    message: notification.message,
    workspaceId,
    data: { totalPages, successCount, errorCount, duration },
    createdAt: notification.createdAt,
  });

  const online = await isUserOnline(userId.toString());
  if (online) {
    notification.deliveredViaSocket = true;
    await notification.save();
  }

  return { success: true, notificationId: notification._id };
}

async function notifySyncFailed({ userId, workspaceId, workspaceName, error }) {
  const notification = await Notification.createSyncFailedNotification({
    userId, workspaceId, workspaceName, error,
  });

  await publishRealtimeEvent(userId.toString(), 'notification:new', {
    id: notification._id,
    type: NotificationTypes.SYNC_FAILED,
    title: notification.title,
    message: notification.message,
    priority: NotificationPriority.URGENT,
    workspaceId,
    data: { error },
    createdAt: notification.createdAt,
  });

  const online = await isUserOnline(userId.toString());
  if (online) {
    notification.deliveredViaSocket = true;
    await notification.save();
  }

  // Also send email for failed syncs
  const user = await User.findById(userId).select('email name notificationPreferences');
  if (user && isNotificationEnabled(user, NotificationTypes.SYNC_FAILED, 'email')) {
    const emailHtml = notificationEmailHtml({
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      priority: 'high',
    });
    const emailResult = await sendEmail({
      to: user.email,
      subject: `[Action Required] ${notification.title}`,
      html: emailHtml,
    });
    if (emailResult.success) {
      notification.deliveredViaEmail = true;
      await notification.save();
    }
  }

  return { success: true, notificationId: notification._id };
}

async function notifyWorkspaceMembers({ workspaceId, excludeUserId = null, type, title, message, data = {} }) {
  const query = { workspaceId, status: 'active' };
  if (excludeUserId) query.userId = { $ne: excludeUserId };

  const members = await WorkspaceMember.find(query).select('userId');

  const results = await Promise.all(
    members.map((member) =>
      createAndDeliver({ userId: member.userId, type, title, message, workspaceId, data })
    )
  );

  return { success: true, delivered: results.length };
}

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

function formatNotification(n) {
  const obj = n.toObject ? n.toObject() : n;
  return {
    id: obj._id,
    type: obj.type,
    title: obj.title,
    message: obj.message,
    priority: obj.priority,
    isRead: obj.isRead,
    readAt: obj.readAt,
    workspaceId: obj.workspaceId?._id || obj.workspaceId,
    workspaceName: obj.workspaceId?.workspaceName,
    actor: obj.actorId
      ? { id: obj.actorId._id || obj.actorId, name: obj.actorId.name, email: obj.actorId.email }
      : null,
    data: obj.data,
    actionUrl: obj.actionUrl,
    actionLabel: obj.actionLabel,
    createdAt: obj.createdAt,
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

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '100kb' }));

// Internal API key guard
app.use('/internal', (req, res, next) => {
  if (INTERNAL_API_KEY && req.headers['x-internal-api-key'] !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Helper: extract userId from X-User-Id header (sent by monolith after JWT auth)
function getUserId(req) {
  return req.headers['x-user-id'];
}

// Liveness probe
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'notification-service', ts: new Date().toISOString() })
);

// ---------------------------------------------------------------------------
// CRUD routes — proxied from notificationController
// ---------------------------------------------------------------------------

// GET /internal/notifications — list
app.get('/internal/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const type = req.query.type || null;
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await Notification.getForUser(userId, { page, limit, type, unreadOnly });

    res.json({
      success: true,
      message: 'Notifications retrieved',
      data: {
        notifications: result.notifications.map(formatNotification),
        pagination: { page: result.page, limit, total: result.total, totalPages: result.totalPages, hasMore: result.hasMore },
      },
    });
  } catch (err) {
    console.error('[notification-service] GET /internal/notifications:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /internal/notifications/count — unread count
app.get('/internal/notifications/count', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const count = await Notification.getUnreadCount(userId);
    res.json({ success: true, message: 'Unread count retrieved', data: { unreadCount: count } });
  } catch (err) {
    console.error('[notification-service] GET /internal/notifications/count:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /internal/notifications/preferences — get preferences
app.get('/internal/notifications/preferences', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const user = await User.findById(userId).select('notificationPreferences');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const preferences = {
      inApp: { ...DEFAULT_PREFERENCES.inApp, ...user.notificationPreferences?.inApp },
      email: { ...DEFAULT_PREFERENCES.email, ...user.notificationPreferences?.email },
    };

    res.json({ success: true, message: 'Preferences retrieved', data: { preferences } });
  } catch (err) {
    console.error('[notification-service] GET /internal/notifications/preferences:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /internal/notifications/preferences — update preferences
app.put('/internal/notifications/preferences', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const { inApp, email } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

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

    res.json({ success: true, message: 'Preferences updated', data: { preferences: user.notificationPreferences } });
  } catch (err) {
    console.error('[notification-service] PUT /internal/notifications/preferences:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /internal/notifications/types — static list
app.get('/internal/notifications/types', (_req, res) => {
  const types = Object.entries(NotificationTypes).map(([key, value]) => ({
    key, value, description: getTypeDescription(value),
  }));
  res.json({ success: true, message: 'Notification types retrieved', data: { types } });
});

// POST /internal/notifications/read — mark batch as read
app.post('/internal/notifications/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const { notificationIds, all = false } = req.body;

    let result;
    if (all === true) {
      result = await Notification.markAllAsRead(userId);
    } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      result = await Notification.markAsRead(userId, notificationIds);
    } else {
      return res.status(400).json({ success: false, error: 'Either notificationIds array or all:true is required' });
    }

    res.json({ success: true, message: 'Notifications marked as read', data: { modifiedCount: result.modified } });
  } catch (err) {
    console.error('[notification-service] POST /internal/notifications/read:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /internal/notifications/:id/mark-read — mark one as read
app.post('/internal/notifications/:id/mark-read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const notification = await Notification.findOne({ _id: req.params.id, userId });
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });

    await notification.markAsRead();
    res.json({ success: true, message: 'Notification marked as read', data: { notification: formatNotification(notification) } });
  } catch (err) {
    console.error('[notification-service] POST /internal/notifications/:id/mark-read:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /internal/notifications/:id — delete
app.delete('/internal/notifications/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

    const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId });
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });

    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    console.error('[notification-service] DELETE /internal/notifications/:id:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Service call routes — proxied from notificationService
// ---------------------------------------------------------------------------

app.post('/internal/notify/deliver', async (req, res) => {
  res.json(await createAndDeliver(req.body));
});

app.post('/internal/notify/workspace-invitation', async (req, res) => {
  try {
    res.json(await notifyWorkspaceInvitation(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/notify/permission-change', async (req, res) => {
  try {
    res.json(await notifyPermissionChange(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/notify/workspace-removal', async (req, res) => {
  try {
    res.json(await notifyWorkspaceRemoval(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/notify/sync-completed', async (req, res) => {
  try {
    res.json(await notifySyncCompleted(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/notify/sync-failed', async (req, res) => {
  try {
    res.json(await notifySyncFailed(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/notify/workspace-members', async (req, res) => {
  try {
    res.json(await notifyWorkspaceMembers(req.body));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

connectDB().then(() => {
  getRedis().connect().catch(() => {
    // Redis connection errors are non-fatal — service continues without realtime delivery
    console.warn('[notification-service] Redis connect failed — realtime events will be skipped');
  });

  app.listen(PORT, () => {
    console.log(`[notification-service] Running on :${PORT}`);
    console.log(`[notification-service] MongoDB: connected`);
    console.log(`[notification-service] Redis: ${REDIS_URL}`);
    console.log(`[notification-service] Email service: ${EMAIL_SERVICE_URL || 'not configured'}`);
  });
});

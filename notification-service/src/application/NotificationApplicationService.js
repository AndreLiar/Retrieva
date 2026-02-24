/**
 * Application Service — Notifications
 *
 * Orchestrates all notification use cases.
 * Depends on ports (injected); knows nothing about MongoDB, Redis, or Express.
 */
import {
  NotificationTypes,
  NotificationPriority,
  DEFAULT_PREFERENCES,
  TYPE_DESCRIPTIONS,
  isNotificationEnabled,
} from '../domain/NotificationTypes.js';

export class NotificationApplicationService {
  /**
   * @param {{
   *   notificationRepo: import('../domain/ports/INotificationRepository').INotificationRepository,
   *   userRepo: import('../domain/ports/IUserRepository').IUserRepository,
   *   workspaceMemberRepo: import('../domain/ports/IWorkspaceMemberRepository').IWorkspaceMemberRepository,
   *   realtimePublisher: import('../domain/ports/IRealtimePublisher').IRealtimePublisher,
   *   emailClient: import('../domain/ports/IEmailClient').IEmailClient,
   *   frontendUrl: string,
   * }} deps
   */
  constructor({ notificationRepo, userRepo, workspaceMemberRepo, realtimePublisher, emailClient, frontendUrl }) {
    this._notificationRepo = notificationRepo;
    this._userRepo = userRepo;
    this._workspaceMemberRepo = workspaceMemberRepo;
    this._realtimePublisher = realtimePublisher;
    this._emailClient = emailClient;
    this._frontendUrl = (frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  }

  // ── CRUD use cases ─────────────────────────────────────────────────────────

  async getForUser(userId, options) {
    return this._notificationRepo.findForUser(userId, options);
  }

  async getUnreadCount(userId) {
    return this._notificationRepo.getUnreadCount(userId);
  }

  async getPreferences(userId) {
    const user = await this._userRepo.findById(userId, 'notificationPreferences');
    if (!user) return null;
    return {
      inApp: { ...DEFAULT_PREFERENCES.inApp, ...user.notificationPreferences?.inApp },
      email: { ...DEFAULT_PREFERENCES.email, ...user.notificationPreferences?.email },
    };
  }

  async updatePreferences(userId, { inApp, email }) {
    const user = await this._userRepo.findById(userId);
    if (!user) return null;
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
    user.markModified?.('notificationPreferences');
    await this._notificationRepo.save(user);
    return user.notificationPreferences;
  }

  async getTypes() {
    return Object.entries(NotificationTypes).map(([key, value]) => ({
      key,
      value,
      description: TYPE_DESCRIPTIONS[value] || value,
    }));
  }

  async markAsRead(userId, { notificationIds, all }) {
    if (all === true) return this._notificationRepo.markAllAsRead(userId);
    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      return this._notificationRepo.markAsRead(userId, notificationIds);
    }
    throw new Error('Either notificationIds array or all:true is required');
  }

  async markOneAsRead(userId, notificationId) {
    const notification = await this._notificationRepo.findOne({ id: notificationId, userId });
    if (!notification) return null;
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this._notificationRepo.save(notification);
    }
    return notification;
  }

  async deleteNotification(userId, notificationId) {
    return this._notificationRepo.findOneAndDelete({ id: notificationId, userId });
  }

  // ── Delivery use cases ─────────────────────────────────────────────────────

  async createAndDeliver(options) {
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
      const user = await this._userRepo.findById(userId, 'email name notificationPreferences');
      if (!user) return { success: false, reason: 'User not found' };

      if (!skipPreferenceCheck && !isNotificationEnabled(user, type, 'inApp')) {
        return { success: true, skipped: true, reason: 'User preference disabled' };
      }

      const notification = await this._notificationRepo.create({
        userId, type, title, message, priority, workspaceId, actorId, data, actionUrl, actionLabel,
      });

      const result = {
        success: true,
        notificationId: notification._id,
        deliveredViaSocket: false,
        deliveredViaEmail: false,
      };

      await this._realtimePublisher.publishToUser(userId.toString(), 'notification:new', {
        id: notification._id, type, title, message, priority, workspaceId, actorId, data, actionUrl, actionLabel,
        createdAt: notification.createdAt,
      });

      const online = await this._realtimePublisher.isUserOnline(userId.toString());
      if (online) {
        notification.deliveredViaSocket = true;
        await this._notificationRepo.save(notification);
        result.deliveredViaSocket = true;
      }

      if (isNotificationEnabled(user, type, 'email') && priority !== NotificationPriority.LOW) {
        const shouldEmail =
          priority === NotificationPriority.URGENT ||
          priority === NotificationPriority.HIGH ||
          !result.deliveredViaSocket;

        if (shouldEmail) {
          const emailResult = await this._emailClient.send({
            to: user.email,
            subject: type === NotificationTypes.SYNC_FAILED ? `[Action Required] ${title}` : title,
            html: this._notificationEmailHtml({ title, message, actionUrl, actionLabel, priority }),
          });
          if (emailResult?.success) {
            notification.deliveredViaEmail = true;
            await this._notificationRepo.save(notification);
            result.deliveredViaEmail = true;
          }
        }
      }

      return result;
    } catch (error) {
      console.error('[NotificationApplicationService] createAndDeliver failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async notifyWorkspaceInvitation({ userId, workspaceId, workspaceName, inviterId, inviterName, role }) {
    const notification = await this._notificationRepo.create({
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

    await this._realtimePublisher.publishToUser(userId.toString(), 'notification:invitation', {
      id: notification._id,
      type: NotificationTypes.WORKSPACE_INVITATION,
      workspaceId, workspaceName, inviterName, role,
      createdAt: notification.createdAt,
    });

    const online = await this._realtimePublisher.isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await this._notificationRepo.save(notification);
    }

    return { success: true, notificationId: notification._id };
  }

  async notifyPermissionChange({ userId, workspaceId, workspaceName, actorId, actorName, oldRole, newRole }) {
    const notification = await this._notificationRepo.create({
      userId,
      type: NotificationTypes.PERMISSION_CHANGED,
      title: 'Permission Updated',
      message: `Your role in "${workspaceName}" was changed from ${oldRole} to ${newRole} by ${actorName}`,
      priority: NotificationPriority.NORMAL,
      workspaceId, actorId,
      data: { oldRole, newRole },
      actionUrl: `/workspaces/${workspaceId}`,
      actionLabel: 'View Workspace',
    });

    await this._realtimePublisher.publishToUser(userId.toString(), 'notification:permission-change', {
      id: notification._id,
      type: NotificationTypes.PERMISSION_CHANGED,
      workspaceId, workspaceName, oldRole, newRole, changedBy: actorName,
      createdAt: notification.createdAt,
    });

    const online = await this._realtimePublisher.isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await this._notificationRepo.save(notification);
    }

    return { success: true, notificationId: notification._id };
  }

  async notifyWorkspaceRemoval({ userId, workspaceId, workspaceName, actorId, actorName }) {
    const notification = await this._notificationRepo.create({
      userId,
      type: NotificationTypes.WORKSPACE_REMOVED,
      title: 'Removed from Workspace',
      message: `You were removed from "${workspaceName}" by ${actorName}`,
      priority: NotificationPriority.HIGH,
      workspaceId, actorId,
      data: { workspaceName },
    });

    await this._realtimePublisher.publishToUser(userId.toString(), 'notification:removed', {
      id: notification._id,
      type: NotificationTypes.WORKSPACE_REMOVED,
      workspaceId, workspaceName, removedBy: actorName,
      createdAt: notification.createdAt,
    });

    const online = await this._realtimePublisher.isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await this._notificationRepo.save(notification);
    }

    return { success: true, notificationId: notification._id };
  }

  async notifySyncCompleted({ userId, workspaceId, workspaceName, totalPages, successCount, errorCount, duration }) {
    const hasErrors = errorCount > 0;
    const notification = await this._notificationRepo.create({
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

    await this._realtimePublisher.publishToUser(userId.toString(), 'notification:new', {
      id: notification._id,
      type: NotificationTypes.SYNC_COMPLETED,
      title: notification.title, message: notification.message,
      workspaceId, data: { totalPages, successCount, errorCount, duration },
      createdAt: notification.createdAt,
    });

    const online = await this._realtimePublisher.isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await this._notificationRepo.save(notification);
    }

    return { success: true, notificationId: notification._id };
  }

  async notifySyncFailed({ userId, workspaceId, workspaceName, error }) {
    const notification = await this._notificationRepo.create({
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

    await this._realtimePublisher.publishToUser(userId.toString(), 'notification:new', {
      id: notification._id,
      type: NotificationTypes.SYNC_FAILED,
      title: notification.title, message: notification.message,
      priority: NotificationPriority.URGENT,
      workspaceId, data: { error },
      createdAt: notification.createdAt,
    });

    const online = await this._realtimePublisher.isUserOnline(userId.toString());
    if (online) {
      notification.deliveredViaSocket = true;
      await this._notificationRepo.save(notification);
    }

    const user = await this._userRepo.findById(userId, 'email name notificationPreferences');
    if (user && isNotificationEnabled(user, NotificationTypes.SYNC_FAILED, 'email')) {
      const emailResult = await this._emailClient.send({
        to: user.email,
        subject: `[Action Required] ${notification.title}`,
        html: this._notificationEmailHtml({
          title: notification.title, message: notification.message,
          actionUrl: notification.actionUrl, actionLabel: notification.actionLabel, priority: 'high',
        }),
      });
      if (emailResult?.success) {
        notification.deliveredViaEmail = true;
        await this._notificationRepo.save(notification);
      }
    }

    return { success: true, notificationId: notification._id };
  }

  async notifyWorkspaceMembers({ workspaceId, excludeUserId = null, type, title, message, data = {} }) {
    const members = await this._workspaceMemberRepo.findActiveMembers(workspaceId, excludeUserId);
    const results = await Promise.all(
      members.map((member) =>
        this.createAndDeliver({ userId: member.userId, type, title, message, workspaceId, data })
      )
    );
    return { success: true, delivered: results.length };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _notificationEmailHtml({ title, message, actionUrl, actionLabel, priority = 'normal' }) {
    const buttonColor = priority === 'high' || priority === 'urgent' ? '#dc2626' : '#667eea';
    const fullActionUrl = actionUrl ? `${this._frontendUrl}${actionUrl}` : null;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;"><h1 style="color: white; margin: 0; font-size: 20px;">${title}</h1></div><div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;"><p>${message}</p>${fullActionUrl && actionLabel ? `<div style="text-align: center; margin: 25px 0;"><a href="${fullActionUrl}" style="background: ${buttonColor}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">${actionLabel}</a></div>` : ''}<hr style="border: none; border-top: 1px solid #e5e7eb;"><p style="font-size: 12px; color: #9ca3af; text-align: center;">This notification was sent by Retrieva.<br><a href="${this._frontendUrl}/settings/notifications" style="color: #667eea;">Manage preferences</a></p></div></body></html>`;
  }
}

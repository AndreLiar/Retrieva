/**
 * Unit Tests — NotificationApplicationService
 *
 * Tests all use cases in isolation using mock ports.
 * No MongoDB, Redis, HTTP, or any infrastructure involved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationApplicationService } from '../../src/application/NotificationApplicationService.js';
import { NotificationTypes, NotificationPriority } from '../../src/domain/NotificationTypes.js';

function makeNotification(overrides = {}) {
  return {
    _id: 'notif-id-1',
    type: 'sync_completed',
    title: 'Sync Complete',
    message: 'Done',
    priority: 'normal',
    isRead: false,
    readAt: null,
    workspaceId: null,
    actorId: null,
    data: {},
    actionUrl: null,
    actionLabel: null,
    deliveredViaSocket: false,
    deliveredViaEmail: false,
    createdAt: new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildService(overrides = {}) {
  const notificationRepo = {
    create: vi.fn().mockResolvedValue(makeNotification()),
    findById: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(null),
    findForUser: vi.fn().mockResolvedValue({ notifications: [], total: 0, page: 1, totalPages: 0, hasMore: false }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markAsRead: vi.fn().mockResolvedValue({ modified: 1 }),
    markAllAsRead: vi.fn().mockResolvedValue({ modified: 5 }),
    findOneAndDelete: vi.fn().mockResolvedValue(makeNotification()),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides.notificationRepo,
  };
  const userRepo = {
    findById: vi.fn().mockResolvedValue({
      _id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      notificationPreferences: {},
      markModified: vi.fn(),
    }),
    ...overrides.userRepo,
  };
  const workspaceMemberRepo = {
    findActiveMembers: vi.fn().mockResolvedValue([]),
    ...overrides.workspaceMemberRepo,
  };
  const realtimePublisher = {
    publishToUser: vi.fn().mockResolvedValue(undefined),
    isUserOnline: vi.fn().mockResolvedValue(false),
    ...overrides.realtimePublisher,
  };
  const emailClient = {
    send: vi.fn().mockResolvedValue({ success: true }),
    ...overrides.emailClient,
  };

  const service = new NotificationApplicationService({
    notificationRepo,
    userRepo,
    workspaceMemberRepo,
    realtimePublisher,
    emailClient,
    frontendUrl: 'http://localhost:3000',
  });

  return { service, notificationRepo, userRepo, workspaceMemberRepo, realtimePublisher, emailClient };
}

describe('NotificationApplicationService', () => {

  // ── getForUser ─────────────────────────────────────────────────────────────
  describe('getForUser', () => {
    it('delegates to notificationRepo.findForUser', async () => {
      const { service, notificationRepo } = buildService();
      notificationRepo.findForUser.mockResolvedValue({ notifications: [makeNotification()], total: 1, page: 1, totalPages: 1, hasMore: false });

      const result = await service.getForUser('user-1', { page: 1, limit: 20 });

      expect(notificationRepo.findForUser).toHaveBeenCalledWith('user-1', { page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });

  // ── getUnreadCount ─────────────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('returns count from repo', async () => {
      const { service, notificationRepo } = buildService();
      notificationRepo.getUnreadCount.mockResolvedValue(3);

      const count = await service.getUnreadCount('user-1');
      expect(count).toBe(3);
    });
  });

  // ── getTypes ───────────────────────────────────────────────────────────────
  describe('getTypes', () => {
    it('returns all notification types with descriptions', async () => {
      const { service } = buildService();
      const types = await service.getTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types[0]).toMatchObject({ key: expect.any(String), value: expect.any(String), description: expect.any(String) });
      const inviteType = types.find((t) => t.value === 'workspace_invitation');
      expect(inviteType).toBeDefined();
    });
  });

  // ── markAsRead ─────────────────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('marks specific notifications as read', async () => {
      const { service, notificationRepo } = buildService();
      const result = await service.markAsRead('user-1', { notificationIds: ['id-1', 'id-2'] });
      expect(notificationRepo.markAsRead).toHaveBeenCalledWith('user-1', ['id-1', 'id-2']);
      expect(result.modified).toBe(1);
    });

    it('marks all as read when all:true', async () => {
      const { service, notificationRepo } = buildService();
      const result = await service.markAsRead('user-1', { all: true });
      expect(notificationRepo.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(result.modified).toBe(5);
    });

    it('throws when neither notificationIds nor all is provided', async () => {
      const { service } = buildService();
      await expect(service.markAsRead('user-1', {})).rejects.toThrow('required');
    });
  });

  // ── markOneAsRead ──────────────────────────────────────────────────────────
  describe('markOneAsRead', () => {
    it('marks the notification as read and saves', async () => {
      const mockNotif = makeNotification({ isRead: false });
      const { service, notificationRepo } = buildService({
        notificationRepo: { findOne: vi.fn().mockResolvedValue(mockNotif) },
      });

      await service.markOneAsRead('user-1', 'notif-1');

      expect(mockNotif.isRead).toBe(true);
      expect(mockNotif.readAt).toBeDefined();
      expect(notificationRepo.save).toHaveBeenCalledWith(mockNotif);
    });

    it('returns null when notification not found', async () => {
      const { service } = buildService({
        notificationRepo: { findOne: vi.fn().mockResolvedValue(null) },
      });
      const result = await service.markOneAsRead('user-1', 'notif-1');
      expect(result).toBeNull();
    });
  });

  // ── deleteNotification ─────────────────────────────────────────────────────
  describe('deleteNotification', () => {
    it('calls findOneAndDelete with correct args', async () => {
      const { service, notificationRepo } = buildService();
      await service.deleteNotification('user-1', 'notif-1');
      expect(notificationRepo.findOneAndDelete).toHaveBeenCalledWith({ id: 'notif-1', userId: 'user-1' });
    });
  });

  // ── createAndDeliver ───────────────────────────────────────────────────────
  describe('createAndDeliver', () => {
    it('creates notification, publishes to realtime, returns success', async () => {
      const { service, notificationRepo, realtimePublisher } = buildService();

      const result = await service.createAndDeliver({
        userId: 'user-1',
        type: NotificationTypes.SYNC_COMPLETED,
        title: 'Sync Done',
        message: 'All pages synced',
      });

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'sync_completed', title: 'Sync Done' })
      );
      expect(realtimePublisher.publishToUser).toHaveBeenCalledWith(
        'user-1',
        'notification:new',
        expect.objectContaining({ type: 'sync_completed' })
      );
      expect(result.success).toBe(true);
    });

    it('skips when user preference is disabled', async () => {
      const { service } = buildService({
        userRepo: {
          findById: vi.fn().mockResolvedValue({
            _id: 'user-1', email: 'a@b.com', name: 'U',
            notificationPreferences: { inApp: { sync_completed: false } },
            markModified: vi.fn(),
          }),
        },
      });

      const result = await service.createAndDeliver({
        userId: 'user-1',
        type: NotificationTypes.SYNC_COMPLETED,
        title: 'Sync',
        message: 'Done',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('returns failure when user not found', async () => {
      const { service } = buildService({
        userRepo: { findById: vi.fn().mockResolvedValue(null) },
      });

      const result = await service.createAndDeliver({
        userId: 'user-999',
        type: 'sync_completed',
        title: 'Sync',
        message: 'Done',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('User not found');
    });

    it('marks deliveredViaSocket=true when user is online', async () => {
      const mockNotif = makeNotification();
      const { service, notificationRepo, realtimePublisher } = buildService({
        notificationRepo: { create: vi.fn().mockResolvedValue(mockNotif) },
        realtimePublisher: {
          publishToUser: vi.fn().mockResolvedValue(undefined),
          isUserOnline: vi.fn().mockResolvedValue(true),
        },
      });

      const result = await service.createAndDeliver({
        userId: 'user-1', type: 'system_alert', title: 'Alert', message: 'Test',
        priority: NotificationPriority.NORMAL,
      });

      expect(result.deliveredViaSocket).toBe(true);
    });

    it('sends email for urgent priority notifications', async () => {
      const { service, emailClient } = buildService({
        realtimePublisher: {
          publishToUser: vi.fn().mockResolvedValue(undefined),
          isUserOnline: vi.fn().mockResolvedValue(false),
        },
        userRepo: {
          findById: vi.fn().mockResolvedValue({
            _id: 'user-1', email: 'a@b.com', name: 'U',
            notificationPreferences: { email: { sync_failed: true } },
            markModified: vi.fn(),
          }),
        },
      });

      await service.createAndDeliver({
        userId: 'user-1', type: NotificationTypes.SYNC_FAILED, title: 'Failed', message: 'Error',
        priority: NotificationPriority.URGENT,
      });

      expect(emailClient.send).toHaveBeenCalled();
    });
  });

  // ── notifyWorkspaceInvitation ─────────────────────────────────────────────
  describe('notifyWorkspaceInvitation', () => {
    it('creates invitation notification and publishes event', async () => {
      const { service, notificationRepo, realtimePublisher } = buildService();

      const result = await service.notifyWorkspaceInvitation({
        userId: 'user-1',
        workspaceId: 'ws-1',
        workspaceName: 'Acme',
        inviterId: 'inviter-1',
        inviterName: 'Alice',
        role: 'member',
      });

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationTypes.WORKSPACE_INVITATION })
      );
      expect(realtimePublisher.publishToUser).toHaveBeenCalledWith(
        'user-1',
        'notification:invitation',
        expect.objectContaining({ workspaceName: 'Acme' })
      );
      expect(result.success).toBe(true);
    });
  });

  // ── notifyWorkspaceMembers ────────────────────────────────────────────────
  describe('notifyWorkspaceMembers', () => {
    it('notifies all active members except excluded user', async () => {
      const { service, workspaceMemberRepo, notificationRepo } = buildService({
        workspaceMemberRepo: {
          findActiveMembers: vi.fn().mockResolvedValue([
            { userId: 'user-2' },
            { userId: 'user-3' },
          ]),
        },
      });

      const result = await service.notifyWorkspaceMembers({
        workspaceId: 'ws-1',
        excludeUserId: 'user-1',
        type: 'member_joined',
        title: 'New Member',
        message: 'Someone joined',
      });

      expect(workspaceMemberRepo.findActiveMembers).toHaveBeenCalledWith('ws-1', 'user-1');
      expect(notificationRepo.create).toHaveBeenCalledTimes(2);
      expect(result.delivered).toBe(2);
    });
  });
});

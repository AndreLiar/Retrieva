import { Router } from 'express';

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

function getUserId(req) {
  return req.headers['x-user-id'];
}

export function createNotificationsRouter(notificationService) {
  const router = Router();

  // GET / — list notifications
  router.get('/', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const type = req.query.type || null;
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await notificationService.getForUser(userId, { page, limit, type, unreadOnly });

      res.json({
        success: true,
        message: 'Notifications retrieved',
        data: {
          notifications: result.notifications.map(formatNotification),
          pagination: { page: result.page, limit, total: result.total, totalPages: result.totalPages, hasMore: result.hasMore },
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /count — unread count
  router.get('/count', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const count = await notificationService.getUnreadCount(userId);
      res.json({ success: true, message: 'Unread count retrieved', data: { unreadCount: count } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /preferences
  router.get('/preferences', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const preferences = await notificationService.getPreferences(userId);
      if (!preferences) return res.status(404).json({ success: false, error: 'User not found' });
      res.json({ success: true, message: 'Preferences retrieved', data: { preferences } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /preferences
  router.put('/preferences', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const preferences = await notificationService.updatePreferences(userId, req.body);
      if (!preferences) return res.status(404).json({ success: false, error: 'User not found' });
      res.json({ success: true, message: 'Preferences updated', data: { preferences } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /types
  router.get('/types', async (_req, res) => {
    const types = await notificationService.getTypes();
    res.json({ success: true, message: 'Notification types retrieved', data: { types } });
  });

  // POST /read — batch mark as read
  router.post('/read', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const result = await notificationService.markAsRead(userId, req.body);
      res.json({ success: true, message: 'Notifications marked as read', data: { modifiedCount: result.modified } });
    } catch (err) {
      if (err.message.includes('required')) return res.status(400).json({ success: false, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/mark-read
  router.post('/:id/mark-read', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const notification = await notificationService.markOneAsRead(userId, req.params.id);
      if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
      res.json({ success: true, message: 'Notification marked as read', data: { notification: formatNotification(notification) } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /:id
  router.delete('/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });
      const notification = await notificationService.deleteNotification(userId, req.params.id);
      if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
      res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

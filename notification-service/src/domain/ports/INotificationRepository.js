/**
 * Port: INotificationRepository
 * Defines persistence operations for notifications.
 */
export class INotificationRepository {
  async create(data) { throw new Error('Not implemented'); }
  async findById(id) { throw new Error('Not implemented'); }
  async findOne({ id, userId }) { throw new Error('Not implemented'); }
  async findForUser(userId, options) { throw new Error('Not implemented'); }
  async getUnreadCount(userId) { throw new Error('Not implemented'); }
  async markAsRead(userId, notificationIds) { throw new Error('Not implemented'); }
  async markAllAsRead(userId) { throw new Error('Not implemented'); }
  async findOneAndDelete({ id, userId }) { throw new Error('Not implemented'); }
  async save(notification) { throw new Error('Not implemented'); }
}

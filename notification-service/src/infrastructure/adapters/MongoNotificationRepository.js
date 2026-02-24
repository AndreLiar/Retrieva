import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
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

// Lazy-register to avoid duplicate model error in tests
function getModel() {
  return mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
}

export class MongoNotificationRepository {
  get _model() { return getModel(); }

  async create(data) {
    const notification = new (this._model)(data);
    await notification.save();
    return notification;
  }

  async findById(id) {
    return this._model.findById(id);
  }

  async findOne({ id, userId }) {
    return this._model.findOne({ _id: id, userId });
  }

  async findForUser(userId, options = {}) {
    const { page = 1, limit = 20, type = null, unreadOnly = false } = options;
    const skip = (page - 1) * limit;
    const query = { userId };
    if (type) query.type = type;
    if (unreadOnly) query.isRead = false;
    const [notifications, total] = await Promise.all([
      this._model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'name email')
        .populate('workspaceId', 'workspaceName workspaceIcon'),
      this._model.countDocuments(query),
    ]);
    return {
      notifications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + notifications.length < total,
    };
  }

  async getUnreadCount(userId) {
    return this._model.countDocuments({ userId, isRead: false });
  }

  async markAsRead(userId, notificationIds) {
    const result = await this._model.updateMany(
      { _id: { $in: notificationIds }, userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return { modified: result.modifiedCount };
  }

  async markAllAsRead(userId) {
    const result = await this._model.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return { modified: result.modifiedCount };
  }

  async findOneAndDelete({ id, userId }) {
    return this._model.findOneAndDelete({ _id: id, userId });
  }

  async save(doc) {
    return doc.save();
  }
}

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String },
    name: { type: String },
    notificationPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: false }
);

function getModel() {
  return mongoose.models.User || mongoose.model('User', userSchema);
}

export class MongoUserRepository {
  get _model() { return getModel(); }

  async findById(userId, select) {
    const q = this._model.findById(userId);
    if (select) q.select(select);
    return q.exec();
  }
}

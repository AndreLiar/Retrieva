import mongoose from 'mongoose';

const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    status: { type: String },
  },
  { strict: false }
);

function getModel() {
  return mongoose.models.WorkspaceMember || mongoose.model('WorkspaceMember', workspaceMemberSchema);
}

export class MongoWorkspaceMemberRepository {
  get _model() { return getModel(); }

  async findActiveMembers(workspaceId, excludeUserId = null) {
    const query = { workspaceId, status: 'active' };
    if (excludeUserId) query.userId = { $ne: excludeUserId };
    return this._model.find(query).select('userId');
  }
}

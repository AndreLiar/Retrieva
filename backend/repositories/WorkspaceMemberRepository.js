import { BaseRepository } from './BaseRepository.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';

class WorkspaceMemberRepository extends BaseRepository {
  constructor(model = WorkspaceMember) {
    super(model);
  }

  async findMembership(workspaceId, userId) {
    return this.findOne({ workspaceId, userId, status: 'active' });
  }

  async findActiveByUserId(userId) {
    return this.find({ userId, status: 'active' });
  }

  async findByWorkspace(workspaceId, status = 'active') {
    return this.find({ workspaceId, status });
  }

  async deleteByWorkspace(workspaceId) {
    return this.deleteMany({ workspaceId });
  }
}

export const workspaceMemberRepository = new WorkspaceMemberRepository();
export { WorkspaceMemberRepository };

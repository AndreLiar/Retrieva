import { BaseRepository } from './BaseRepository.js';
import { OrganizationMember } from '../models/OrganizationMember.js';

class OrganizationMemberRepository extends BaseRepository {
  constructor(model = OrganizationMember) {
    super(model);
  }

  async findActiveByUserId(userId) {
    return this.findOne({ userId, status: 'active' });
  }

  async findByOrganization(organizationId, status = 'active') {
    return this.find({ organizationId, status });
  }

  async revokeMembership(memberId) {
    return this.updateById(memberId, { status: 'revoked' });
  }

  async countAdmins(organizationId) {
    return this.count({ organizationId, role: 'admin', status: 'active' });
  }

  // ── Model-static delegations ───────────────────────────────────────────────
  // These wrap statics declared on the OrganizationMember schema so callers
  // can stay at the repository boundary instead of importing the model.

  async findByToken(rawToken) {
    return this.model.findByToken(rawToken);
  }

  async createInvite(organizationId, email, role, invitedBy) {
    return this.model.createInvite(organizationId, email, role, invitedBy);
  }

  async activate(memberId, userId) {
    return this.model.activate(memberId, userId);
  }
}

export const organizationMemberRepository = new OrganizationMemberRepository();
export { OrganizationMemberRepository };

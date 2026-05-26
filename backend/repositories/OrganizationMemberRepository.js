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
}

export const organizationMemberRepository = new OrganizationMemberRepository();
export { OrganizationMemberRepository };

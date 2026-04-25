import { Workspace } from '../models/Workspace.js';
import { BaseRepository } from './BaseRepository.js';

class WorkspaceRepository extends BaseRepository {
  constructor(model = Workspace) {
    super(model);
  }

  async findByOrganization(organizationId, options = {}) {
    const filter = { organizationId };
    const query = this.model.find(filter);
    if (options.select) query.select(options.select);
    if (options.sort) query.sort(options.sort);
    return query.lean();
  }

  async findWithCertifications() {
    return this.model.find({ 'certifications.0': { $exists: true } }).lean();
  }

  async findWithExpiringCertifications(thresholdDate) {
    return this.model.find({ 'certifications.validUntil': { $lte: thresholdDate } }).lean();
  }

  async findByContractEndingSoon(from, to) {
    return this.model.find({ contractEnd: { $ne: null, $gte: from, $lte: to } }).lean();
  }

  async findDueForReview(asOf = new Date()) {
    return this.model.find({ nextReviewDate: { $ne: null, $lt: asOf } }).lean();
  }

  async setNextReviewDate(id, nextReviewDate, session) {
    return this.model.findByIdAndUpdate(
      id,
      { nextReviewDate },
      { new: true, ...(session ? { session } : {}) }
    );
  }
}

export const workspaceRepository = new WorkspaceRepository();
export { WorkspaceRepository };

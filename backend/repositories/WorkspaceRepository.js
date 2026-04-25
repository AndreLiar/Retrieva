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

  async findWithExpiringCertifications(thresholdDate) {
    return this.model
      .find({
        'certifications.expiryDate': { $lte: thresholdDate },
      })
      .lean();
  }

  async findDueForReview(asOf = new Date()) {
    return this.model.find({ nextReviewDate: { $lte: asOf } }).lean();
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

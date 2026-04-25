import { Assessment } from '../models/Assessment.js';
import { BaseRepository } from './BaseRepository.js';

class AssessmentRepository extends BaseRepository {
  constructor(model = Assessment) {
    super(model);
  }

  async findByWorkspaces(workspaceIds, options = {}) {
    const filter = { workspaceId: { $in: workspaceIds } };
    if (options.status) filter.status = options.status;
    if (options.workspaceId) filter.workspaceId = options.workspaceId;

    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const skip = (page - 1) * limit;

    const [assessments, total] = await Promise.all([
      this.model
        .find(filter)
        .select('-results.gaps')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return { assessments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async markDocumentStatus(id, docIndex, status, extra = {}) {
    return this.model.findByIdAndUpdate(id, {
      [`documents.${docIndex}.status`]: status,
      ...extra,
    });
  }

  async markDocumentIndexed(id, docIndex, collectionName) {
    return this.model.findByIdAndUpdate(id, {
      [`documents.${docIndex}.status`]: 'indexed',
      [`documents.${docIndex}.qdrantCollectionId`]: collectionName,
    });
  }

  async completeAnalysis(id, results) {
    return this.model.findByIdAndUpdate(id, {
      status: 'complete',
      statusMessage: 'Analysis complete',
      'results.gaps': results.gaps,
      'results.overallRisk': results.overallRisk,
      'results.summary': results.summary || '',
      'results.domainsAnalyzed': results.domainsAnalyzed || [],
      'results.generatedAt': new Date(),
    });
  }

  async findLatestByWorkspace(workspaceId, withinMs) {
    const filter = { workspaceId, status: 'complete' };
    if (withinMs) filter.createdAt = { $gte: new Date(Date.now() - withinMs) };
    return this.model.findOne(filter).sort({ createdAt: -1 }).lean();
  }
}

export const assessmentRepository = new AssessmentRepository();
export { AssessmentRepository };

import { describe, it, expect, vi } from 'vitest';
import { WorkspaceRepository } from '../../repositories/WorkspaceRepository.js';

vi.mock('../../models/Workspace.js', () => ({ Workspace: {} }));

function makeLeanQuery(value = []) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function makeModel(overrides = {}) {
  return {
    find: vi.fn().mockReturnValue(makeLeanQuery()),
    findByIdAndUpdate: vi.fn(),
    ...overrides,
  };
}

describe('WorkspaceRepository.findByOrganization', () => {
  it('filters by organizationId', async () => {
    const model = makeModel();
    const q = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    model.find.mockReturnValue(q);
    const repo = new WorkspaceRepository(model);

    await repo.findByOrganization('org1');

    expect(model.find).toHaveBeenCalledWith({ organizationId: 'org1' });
  });
});

describe('WorkspaceRepository.findWithCertifications', () => {
  it('queries for workspaces with at least one certification', async () => {
    const model = makeModel();
    model.find.mockReturnValue(makeLeanQuery([{ _id: 'ws1', certifications: [{}] }]));
    const repo = new WorkspaceRepository(model);

    const result = await repo.findWithCertifications();

    expect(model.find).toHaveBeenCalledWith({ 'certifications.0': { $exists: true } });
    expect(result).toHaveLength(1);
  });
});

describe('WorkspaceRepository.findWithExpiringCertifications', () => {
  it('filters by certifications.validUntil', async () => {
    const model = makeModel();
    const threshold = new Date();
    const repo = new WorkspaceRepository(model);

    await repo.findWithExpiringCertifications(threshold);

    expect(model.find).toHaveBeenCalledWith({
      'certifications.validUntil': { $lte: threshold },
    });
  });
});

describe('WorkspaceRepository.findByContractEndingSoon', () => {
  it('queries contractEnd between from and to', async () => {
    const model = makeModel();
    const from = new Date();
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const repo = new WorkspaceRepository(model);

    await repo.findByContractEndingSoon(from, to);

    expect(model.find).toHaveBeenCalledWith({
      contractEnd: { $ne: null, $gte: from, $lte: to },
    });
  });
});

describe('WorkspaceRepository.findDueForReview', () => {
  it('queries nextReviewDate before the given date', async () => {
    const model = makeModel();
    const asOf = new Date();
    const repo = new WorkspaceRepository(model);

    await repo.findDueForReview(asOf);

    expect(model.find).toHaveBeenCalledWith({
      nextReviewDate: { $ne: null, $lt: asOf },
    });
  });

  it('uses current date when asOf is not provided', async () => {
    const model = makeModel();
    const repo = new WorkspaceRepository(model);

    await repo.findDueForReview();

    const filter = model.find.mock.calls[0][0];
    expect(filter.nextReviewDate.$lt).toBeInstanceOf(Date);
  });
});

describe('WorkspaceRepository.setNextReviewDate', () => {
  it('calls findByIdAndUpdate with the next review date', async () => {
    const model = makeModel();
    model.findByIdAndUpdate.mockResolvedValue({ _id: 'ws1' });
    const nextReviewDate = new Date();
    const repo = new WorkspaceRepository(model);

    await repo.setNextReviewDate('ws1', nextReviewDate);

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'ws1',
      { nextReviewDate },
      expect.objectContaining({ new: true })
    );
  });

  it('passes session when provided', async () => {
    const model = makeModel();
    model.findByIdAndUpdate.mockResolvedValue({ _id: 'ws1' });
    const session = { id: 'session-1' };
    const repo = new WorkspaceRepository(model);

    await repo.setNextReviewDate('ws1', new Date(), session);

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'ws1',
      expect.any(Object),
      expect.objectContaining({ session })
    );
  });
});

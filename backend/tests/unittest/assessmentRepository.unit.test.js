import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssessmentRepository } from '../../repositories/AssessmentRepository.js';

vi.mock('../../models/Assessment.js', () => ({ Assessment: {} }));

function makeModel(overrides = {}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  return {
    find: vi.fn().mockReturnValue(query),
    findOne: vi
      .fn()
      .mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      }),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    countDocuments: vi.fn().mockResolvedValue(0),
    _query: query,
    ...overrides,
  };
}

describe('AssessmentRepository.findByWorkspaces', () => {
  it('queries by workspaceId array and returns paginated result', async () => {
    const model = makeModel();
    const doc = { _id: 'a1', name: 'Test' };
    model._query.lean.mockResolvedValue([doc]);
    model.countDocuments.mockResolvedValue(1);

    const repo = new AssessmentRepository(model);
    const result = await repo.findByWorkspaces(['ws1'], { page: '1', limit: '10' });

    expect(model.find).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: { $in: ['ws1'] } })
    );
    expect(result.assessments).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
  });

  it('applies optional status and workspaceId filters', async () => {
    const model = makeModel();
    model.countDocuments.mockResolvedValue(0);
    const repo = new AssessmentRepository(model);

    await repo.findByWorkspaces(['ws1'], { status: 'complete', workspaceId: 'ws1' });

    expect(model.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', workspaceId: 'ws1' })
    );
  });

  it('defaults page=1 and limit=20 when not provided', async () => {
    const model = makeModel();
    model.countDocuments.mockResolvedValue(0);
    const repo = new AssessmentRepository(model);

    const result = await repo.findByWorkspaces(['ws1']);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(20);
  });
});

describe('AssessmentRepository.markDocumentStatus', () => {
  it('calls findByIdAndUpdate with the correct path', async () => {
    const model = makeModel();
    model.findByIdAndUpdate.mockResolvedValue({ _id: 'a1' });
    const repo = new AssessmentRepository(model);

    await repo.markDocumentStatus('a1', 0, 'indexed');

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith('a1', {
      'documents.0.status': 'indexed',
    });
  });
});

describe('AssessmentRepository.markDocumentIndexed', () => {
  it('sets status and qdrantCollectionId', async () => {
    const model = makeModel();
    model.findByIdAndUpdate.mockResolvedValue({ _id: 'a1' });
    const repo = new AssessmentRepository(model);

    await repo.markDocumentIndexed('a1', 2, 'assessment_a1');

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith('a1', {
      'documents.2.status': 'indexed',
      'documents.2.qdrantCollectionId': 'assessment_a1',
    });
  });
});

describe('AssessmentRepository.completeAnalysis', () => {
  it('sets status=complete and stores results', async () => {
    const model = makeModel();
    model.findByIdAndUpdate.mockResolvedValue({ _id: 'a1' });
    const repo = new AssessmentRepository(model);

    await repo.completeAnalysis('a1', {
      gaps: [{ domain: 'ICT risk', severity: 'high' }],
      overallRisk: 'high',
      summary: 'summary text',
      domainsAnalyzed: ['ICT risk'],
    });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        status: 'complete',
        'results.overallRisk': 'high',
        'results.summary': 'summary text',
      })
    );
  });
});

describe('AssessmentRepository.findLatestByWorkspace', () => {
  let model;
  let sortMock;
  let leanMock;

  beforeEach(() => {
    leanMock = vi.fn().mockResolvedValue(null);
    sortMock = vi.fn().mockReturnValue({ lean: leanMock });
    model = makeModel();
    model.findOne = vi.fn().mockReturnValue({ sort: sortMock });
  });

  it('queries with status=complete and no date filter when withinMs is absent', async () => {
    const repo = new AssessmentRepository(model);
    await repo.findLatestByWorkspace('ws1');

    expect(model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws1', status: 'complete' })
    );
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('adds createdAt filter when withinMs is provided', async () => {
    const repo = new AssessmentRepository(model);
    await repo.findLatestByWorkspace('ws1', 7 * 24 * 60 * 60 * 1000);

    const filter = model.findOne.mock.calls[0][0];
    expect(filter.createdAt).toBeDefined();
  });
});

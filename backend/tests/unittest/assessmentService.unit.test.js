import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { AssessmentService } from '../../services/AssessmentService.js';

// ---------------------------------------------------------------------------
// Mock module-level imports to prevent real connections on load
// ---------------------------------------------------------------------------
vi.mock('../../models/Assessment.js', () => ({ Assessment: {} }));
vi.mock('../../models/Workspace.js', () => ({ Workspace: {} }));
vi.mock('../../models/User.js', () => ({ User: {} }));
vi.mock('../../config/queue.js', () => ({
  assessmentQueue: { add: vi.fn() },
  monitoringQueue: { getJob: vi.fn(), add: vi.fn() },
}));
vi.mock('../../config/storage.js', () => ({
  isStorageConfigured: vi.fn().mockReturnValue(false),
  buildAssessmentFileKey: vi.fn(),
  uploadFile: vi.fn(),
  downloadFileStream: vi.fn(),
}));
vi.mock('../../services/reportGenerator.js', () => ({ generateReport: vi.fn() }));
vi.mock('../../services/fileIngestionService.js', () => ({
  deleteAssessmentCollection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const WORKSPACE_OID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ASSESSMENT_OID = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const USER_ID = 'user-abc';

const AUTH_IDS = [WORKSPACE_OID.toString()];

function makeAssessmentDoc(overrides = {}) {
  return {
    _id: ASSESSMENT_OID,
    workspaceId: WORKSPACE_OID,
    name: 'DORA Q1',
    vendorName: 'Acme',
    framework: 'DORA',
    status: 'complete',
    statusMessage: '',
    documents: [],
    createdBy: USER_ID,
    riskDecision: null,
    clauseSignoffs: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFile(name = 'policy.pdf') {
  return {
    originalname: name,
    buffer: Buffer.from('pdf'),
    size: 100,
    mimetype: 'application/pdf',
  };
}

function makeDeps(overrides = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const storage = {
    isStorageConfigured: vi.fn().mockReturnValue(false),
    buildAssessmentFileKey: vi.fn(),
    uploadFile: vi.fn(),
    downloadFileStream: vi.fn(),
  };
  const assessmentQueue = { add: vi.fn().mockResolvedValue({ id: 'j1' }) };
  const monitoringQueue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue({ id: 'j2' }),
  };
  const Assessment = {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  };
  const Workspace = { findByIdAndUpdate: vi.fn().mockResolvedValue(undefined) };
  const User = { updateOne: vi.fn().mockReturnValue({ catch: vi.fn() }) };
  const generateReport = vi.fn().mockResolvedValue(Buffer.from('docx'));
  const deleteAssessmentCollection = vi.fn().mockResolvedValue(undefined);

  return {
    Assessment,
    Workspace,
    User,
    assessmentQueue,
    monitoringQueue,
    storage,
    generateReport,
    deleteAssessmentCollection,
    logger,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createAssessment
// ---------------------------------------------------------------------------
describe('AssessmentService.createAssessment', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
  });

  it('creates the assessment record with correct fields', async () => {
    const doc = makeAssessmentDoc({ status: 'pending' });
    deps.Assessment.create.mockResolvedValue(doc);

    const result = await svc.createAssessment(
      USER_ID,
      null,
      { name: 'Q1', vendorName: 'Acme', workspaceId: WORKSPACE_OID.toString() },
      [makeFile()]
    );

    expect(deps.Assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Q1',
        vendorName: 'Acme',
        framework: 'DORA',
        status: 'pending',
      })
    );
    expect(result._id).toBe(ASSESSMENT_OID);
  });

  it('enqueues one fileIndex job per file and one gapAnalysis job', async () => {
    deps.Assessment.create.mockResolvedValue(makeAssessmentDoc({ documents: [{}] }));
    const files = [makeFile('a.pdf'), makeFile('b.pdf')];

    await svc.createAssessment(
      USER_ID,
      null,
      { name: 'Q1', vendorName: 'Acme', workspaceId: 'ws1' },
      files
    );

    const calls = deps.assessmentQueue.add.mock.calls.map((c) => c[0]);
    expect(calls.filter((t) => t === 'fileIndex')).toHaveLength(2);
    expect(calls.filter((t) => t === 'gapAnalysis')).toHaveLength(1);
  });

  it('skips S3 upload when storage is not configured', async () => {
    deps.Assessment.create.mockResolvedValue(makeAssessmentDoc());
    deps.storage.isStorageConfigured.mockReturnValue(false);

    await svc.createAssessment(
      USER_ID,
      'org-1',
      { name: 'Q1', vendorName: 'Acme', workspaceId: 'ws1' },
      [makeFile()]
    );

    expect(deps.storage.uploadFile).not.toHaveBeenCalled();
  });

  it('fires onboarding checklist update', async () => {
    deps.Assessment.create.mockResolvedValue(makeAssessmentDoc());

    await svc.createAssessment(
      USER_ID,
      null,
      { name: 'Q1', vendorName: 'Acme', workspaceId: 'ws1' },
      [makeFile()]
    );

    expect(deps.User.updateOne).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAssessment
// ---------------------------------------------------------------------------
describe('AssessmentService.getAssessment', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
  });

  it('throws 404 when assessment does not exist', async () => {
    deps.Assessment.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    await expect(svc.getAssessment(ASSESSMENT_OID.toString(), AUTH_IDS)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 403 when workspace is not authorized', async () => {
    const doc = makeAssessmentDoc({ workspaceId: new mongoose.Types.ObjectId() });
    deps.Assessment.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
    await expect(svc.getAssessment(ASSESSMENT_OID.toString(), AUTH_IDS)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('returns the assessment when authorized', async () => {
    const doc = makeAssessmentDoc();
    deps.Assessment.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
    const result = await svc.getAssessment(ASSESSMENT_OID.toString(), AUTH_IDS);
    expect(result.name).toBe('DORA Q1');
  });
});

// ---------------------------------------------------------------------------
// listAssessments
// ---------------------------------------------------------------------------
describe('AssessmentService.listAssessments', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([makeAssessmentDoc()]),
    };
    deps.Assessment.find.mockReturnValue(query);
    deps.Assessment.countDocuments.mockResolvedValue(1);
  });

  it('returns assessments and pagination metadata', async () => {
    const result = await svc.listAssessments(AUTH_IDS, { page: '1', limit: '10' });
    expect(result.assessments).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// setRiskDecision
// ---------------------------------------------------------------------------
describe('AssessmentService.setRiskDecision', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
  });

  it('throws 404 when assessment not found', async () => {
    deps.Assessment.findById.mockResolvedValue(null);
    await expect(
      svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, { decision: 'proceed' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when workspace not authorized', async () => {
    const doc = makeAssessmentDoc({ workspaceId: new mongoose.Types.ObjectId() });
    deps.Assessment.findById.mockResolvedValue(doc);
    await expect(
      svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, { decision: 'proceed' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('saves the risk decision and returns it', async () => {
    const doc = makeAssessmentDoc();
    deps.Assessment.findById.mockResolvedValue(doc);

    const result = await svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, {
      decision: 'proceed',
      rationale: 'All good',
    });

    expect(doc.riskDecision.decision).toBe('proceed');
    expect(doc.riskDecision.rationale).toBe('All good');
    expect(doc.save).toHaveBeenCalled();
    expect(result.decision).toBe('proceed');
  });

  it('schedules a review reminder for proceed decisions', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc());
    await svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, {
      decision: 'proceed',
    });
    expect(deps.monitoringQueue.add).toHaveBeenCalledWith(
      'review-reminder',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('does not schedule a reminder for reject decisions', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc());
    await svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, { decision: 'reject' });
    expect(deps.monitoringQueue.add).not.toHaveBeenCalled();
  });

  it('does not throw when reminder scheduling fails (non-critical)', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc());
    deps.monitoringQueue.getJob.mockRejectedValue(new Error('Redis down'));
    await expect(
      svc.setRiskDecision(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, { decision: 'proceed' })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// setClauseSignoff
// ---------------------------------------------------------------------------
describe('AssessmentService.setClauseSignoff', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
  });

  it('throws 400 when framework is not CONTRACT_A30', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc({ framework: 'DORA' }));
    await expect(
      svc.setClauseSignoff(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, {
        clauseRef: 'Art.30(1)',
        status: 'accepted',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('pushes a new signoff', async () => {
    const doc = makeAssessmentDoc({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    deps.Assessment.findById.mockResolvedValue(doc);

    const result = await svc.setClauseSignoff(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, {
      clauseRef: 'Art.30(1)',
      status: 'accepted',
      note: 'ok',
    });

    expect(result).toHaveLength(1);
    expect(result[0].clauseRef).toBe('Art.30(1)');
    expect(result[0].status).toBe('accepted');
    expect(doc.save).toHaveBeenCalled();
  });

  it('upserts an existing signoff for the same clauseRef', async () => {
    const doc = makeAssessmentDoc({
      framework: 'CONTRACT_A30',
      clauseSignoffs: [{ clauseRef: 'Art.30(1)', status: 'rejected' }],
    });
    deps.Assessment.findById.mockResolvedValue(doc);

    const result = await svc.setClauseSignoff(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS, {
      clauseRef: 'Art.30(1)',
      status: 'waived',
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('waived');
  });
});

// ---------------------------------------------------------------------------
// deleteAssessment
// ---------------------------------------------------------------------------
describe('AssessmentService.deleteAssessment', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new AssessmentService(deps);
    deps.Assessment.findByIdAndDelete.mockResolvedValue(undefined);
  });

  it('throws 404 when assessment not found', async () => {
    deps.Assessment.findById.mockResolvedValue(null);
    await expect(
      svc.deleteAssessment(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when workspace not authorized', async () => {
    const doc = makeAssessmentDoc({ workspaceId: new mongoose.Types.ObjectId() });
    deps.Assessment.findById.mockResolvedValue(doc);
    await expect(
      svc.deleteAssessment(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 403 when caller is not the creator', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc({ createdBy: 'other-user' }));
    await expect(
      svc.deleteAssessment(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deletes the record and fires Qdrant cleanup', async () => {
    deps.Assessment.findById.mockResolvedValue(makeAssessmentDoc());

    await svc.deleteAssessment(ASSESSMENT_OID.toString(), USER_ID, AUTH_IDS);

    expect(deps.Assessment.findByIdAndDelete).toHaveBeenCalledWith(ASSESSMENT_OID.toString());
    expect(deps.deleteAssessmentCollection).toHaveBeenCalledWith(ASSESSMENT_OID.toString());
  });
});

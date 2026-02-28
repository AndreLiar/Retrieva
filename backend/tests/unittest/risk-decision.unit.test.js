/**
 * Unit Tests — setRiskDecision + setClauseSignoff controller handlers
 *
 * All DB/Redis/queue dependencies are mocked.
 * catchAsync is unwrapped so async errors propagate to next().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// Mocks (must be before subject imports)
// ---------------------------------------------------------------------------

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    catchAsync: (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        next(err);
      }
    },
  };
});

vi.mock('../../config/queue.js', () => ({
  assessmentQueue: { add: vi.fn().mockResolvedValue({ id: 'j1' }) },
}));

vi.mock('../../middleware/fileUpload.js', () => ({
  handleFileUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/reportGenerator.js', () => ({
  generateReport: vi.fn().mockResolvedValue(Buffer.from('docx')),
}));

vi.mock('../../services/fileIngestionService.js', () => ({
  assessmentCollectionName: vi.fn((id) => `assessment_${id}`),
  deleteAssessmentCollection: vi.fn().mockResolvedValue(undefined),
  ingestFile: vi.fn().mockResolvedValue({ chunkCount: 5 }),
  searchAssessmentChunks: vi.fn().mockResolvedValue([]),
  chunkText: vi.fn().mockReturnValue([]),
  parseFile: vi.fn().mockResolvedValue('text'),
}));

// ---------------------------------------------------------------------------
// Shared mock assessment document factory
// ---------------------------------------------------------------------------

const WORKSPACE_OID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ASSESSMENT_OID = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

function makeMockAssessment(overrides = {}) {
  return {
    _id: ASSESSMENT_OID,
    workspaceId: WORKSPACE_OID,
    name: 'DORA Q1',
    vendorName: 'Acme',
    framework: 'DORA',
    status: 'complete',
    riskDecision: null,
    clauseSignoffs: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

vi.mock('../../models/Assessment.js', () => ({
  Assessment: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Subject imports
// ---------------------------------------------------------------------------

import { setRiskDecision, setClauseSignoff } from '../../controllers/assessmentController.js';
import { Assessment } from '../../models/Assessment.js';

// ---------------------------------------------------------------------------
// Request/response factory
// ---------------------------------------------------------------------------

function makeReqRes(bodyOverrides = {}, paramOverrides = {}) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = {
    user: { userId: 'user-abc', name: 'Alice', email: 'alice@example.com' },
    authorizedWorkspaces: [{ _id: WORKSPACE_OID }],
    body: bodyOverrides,
    params: { id: ASSESSMENT_OID.toString(), ...paramOverrides },
    query: {},
  };
  const next = vi.fn();
  return { req, res, next };
}

// ---------------------------------------------------------------------------
// setRiskDecision
// ---------------------------------------------------------------------------

describe('setRiskDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for an invalid decision value', async () => {
    const { req, res, next } = makeReqRes({ decision: 'approve' });
    await setRiskDecision(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('calls next(AppError 404) when assessment not found', async () => {
    Assessment.findById.mockResolvedValue(null);
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    await setRiskDecision(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('calls next(AppError 403) when workspace is not authorized', async () => {
    const otherWorkspace = new mongoose.Types.ObjectId('cccccccccccccccccccccccc');
    Assessment.findById.mockResolvedValue(makeMockAssessment({ workspaceId: otherWorkspace }));
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    await setRiskDecision(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('saves proceed decision and returns 200', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'proceed', rationale: 'All good' });
    await setRiskDecision(req, res, next);
    expect(mockDoc.save).toHaveBeenCalled();
    expect(mockDoc.riskDecision.decision).toBe('proceed');
    expect(mockDoc.riskDecision.rationale).toBe('All good');
    expect(mockDoc.riskDecision.setBy).toBe('user-abc');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saves conditional decision correctly', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({
      decision: 'conditional',
      rationale: 'Needs improvement',
    });
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.decision).toBe('conditional');
  });

  it('saves reject decision correctly', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'reject', rationale: 'Too risky' });
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.decision).toBe('reject');
  });

  it('stores user name in setByName', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.setByName).toBe('Alice');
  });

  it('falls back to email when name is not present', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    req.user.name = undefined;
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.setByName).toBe('alice@example.com');
  });

  it('trims whitespace from rationale', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'proceed', rationale: '  trimmed  ' });
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.rationale).toBe('trimmed');
  });

  it('allows empty rationale', async () => {
    const mockDoc = makeMockAssessment();
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    await setRiskDecision(req, res, next);
    expect(mockDoc.riskDecision.rationale).toBe('');
  });
});

// ---------------------------------------------------------------------------
// setClauseSignoff
// ---------------------------------------------------------------------------

describe('setClauseSignoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when clauseRef is missing', async () => {
    const { req, res, next } = makeReqRes({ status: 'accepted' });
    await setClauseSignoff(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for an invalid status value', async () => {
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'approved' });
    await setClauseSignoff(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('calls next(AppError 404) when assessment not found', async () => {
    Assessment.findById.mockResolvedValue(null);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'accepted' });
    await setClauseSignoff(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('returns 400 when framework is not CONTRACT_A30', async () => {
    const mockDoc = makeMockAssessment({ framework: 'DORA' });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'accepted' });
    await setClauseSignoff(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('pushes a new signoff and returns 200', async () => {
    const mockDoc = makeMockAssessment({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({
      clauseRef: 'Art.30(1)',
      status: 'accepted',
      note: 'OK',
    });
    await setClauseSignoff(req, res, next);
    expect(mockDoc.clauseSignoffs).toHaveLength(1);
    expect(mockDoc.clauseSignoffs[0].clauseRef).toBe('Art.30(1)');
    expect(mockDoc.clauseSignoffs[0].status).toBe('accepted');
    expect(mockDoc.clauseSignoffs[0].note).toBe('OK');
    expect(mockDoc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('upserts existing signoff for the same clauseRef', async () => {
    const existing = {
      clauseRef: 'Art.30(1)',
      status: 'rejected',
      signedBy: 'user-old',
      signedByName: 'Old User',
      note: 'old note',
    };
    const mockDoc = makeMockAssessment({
      framework: 'CONTRACT_A30',
      clauseSignoffs: [existing],
    });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({
      clauseRef: 'Art.30(1)',
      status: 'waived',
      note: 'waived now',
    });
    await setClauseSignoff(req, res, next);
    // Should still have exactly 1 signoff (upserted, not appended)
    expect(mockDoc.clauseSignoffs).toHaveLength(1);
    expect(mockDoc.clauseSignoffs[0].status).toBe('waived');
    expect(mockDoc.clauseSignoffs[0].note).toBe('waived now');
  });

  it('stores signedBy and signedByName from the authenticated user', async () => {
    const mockDoc = makeMockAssessment({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(2)', status: 'accepted' });
    await setClauseSignoff(req, res, next);
    expect(mockDoc.clauseSignoffs[0].signedBy).toBe('user-abc');
    expect(mockDoc.clauseSignoffs[0].signedByName).toBe('Alice');
  });

  it('accepts rejected status', async () => {
    const mockDoc = makeMockAssessment({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(3)', status: 'rejected' });
    await setClauseSignoff(req, res, next);
    expect(mockDoc.clauseSignoffs[0].status).toBe('rejected');
  });

  it('accepts waived status', async () => {
    const mockDoc = makeMockAssessment({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(4)', status: 'waived' });
    await setClauseSignoff(req, res, next);
    expect(mockDoc.clauseSignoffs[0].status).toBe('waived');
  });

  it('returns the updated clauseSignoffs array in the response', async () => {
    const mockDoc = makeMockAssessment({ framework: 'CONTRACT_A30', clauseSignoffs: [] });
    Assessment.findById.mockResolvedValue(mockDoc);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'accepted' });
    await setClauseSignoff(req, res, next);
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall).toBeDefined();
    expect(jsonCall.data.clauseSignoffs).toBeDefined();
  });
});

/**
 * Unit Tests — Assessment Controller HTTP Layer
 *
 * The controller is thin: it delegates to assessmentService and formats HTTP responses.
 * These tests verify the HTTP contract; service-level logic is tested in assessmentService.unit.test.js.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// Mocks — declared before subject import
// ---------------------------------------------------------------------------

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

const mockService = vi.hoisted(() => ({
  createAssessment: vi.fn(),
  listAssessments: vi.fn(),
  getAssessment: vi.fn(),
  getReportBuffer: vi.fn(),
  setRiskDecision: vi.fn(),
  setClauseSignoff: vi.fn(),
  getAssessmentFileDownload: vi.fn(),
  deleteAssessment: vi.fn(),
}));

vi.mock('../../services/AssessmentService.js', () => ({
  assessmentService: mockService,
}));

// ---------------------------------------------------------------------------
// Subject imports
// ---------------------------------------------------------------------------

import {
  createAssessment,
  listAssessments,
  getAssessment,
  deleteAssessment,
} from '../../controllers/assessmentController.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_OID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ASSESSMENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const mockAssessmentDoc = {
  _id: ASSESSMENT_ID,
  name: 'Q1 DORA',
  vendorName: 'Acme',
  framework: 'DORA',
  status: 'pending',
  statusMessage: 'Queued…',
  documents: [],
  createdAt: new Date(),
};

function makeReq(overrides = {}) {
  return {
    user: { userId: 'user-abc' },
    authorizedWorkspaces: [{ _id: WORKSPACE_OID }],
    body: {},
    params: {},
    query: {},
    files: [],
    ...overrides,
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// createAssessment
// ---------------------------------------------------------------------------

describe('assessmentController.createAssessment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when no files are uploaded', async () => {
    const req = makeReq({ files: [] });
    const res = makeRes();
    await createAssessment(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 201 with assessment from service', async () => {
    mockService.createAssessment.mockResolvedValue(mockAssessmentDoc);
    const req = makeReq({
      files: [
        { originalname: 'a.pdf', buffer: Buffer.from('x'), size: 10, mimetype: 'application/pdf' },
      ],
      body: { name: 'Q1', vendorName: 'Acme', workspaceId: 'ws1' },
    });
    const res = makeRes();
    await createAssessment(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createAssessment).toHaveBeenCalledWith(
      'user-abc',
      undefined,
      req.body,
      req.files
    );
  });

  it('calls next when service throws', async () => {
    mockService.createAssessment.mockRejectedValue(new Error('fail'));
    const req = makeReq({ files: [{}], body: {} });
    const next = vi.fn();
    await createAssessment(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// listAssessments
// ---------------------------------------------------------------------------

describe('assessmentController.listAssessments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to service and returns 200', async () => {
    mockService.listAssessments.mockResolvedValue({ assessments: [], pagination: { total: 0 } });
    const req = makeReq({ query: { page: '1' } });
    const res = makeRes();
    await listAssessments(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.listAssessments).toHaveBeenCalledWith([WORKSPACE_OID.toString()], req.query);
  });
});

// ---------------------------------------------------------------------------
// getAssessment
// ---------------------------------------------------------------------------

describe('assessmentController.getAssessment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with assessment on success', async () => {
    mockService.getAssessment.mockResolvedValue(mockAssessmentDoc);
    const req = makeReq({ params: { id: ASSESSMENT_ID } });
    const res = makeRes();
    await getAssessment(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('passes service errors to next()', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 });
    mockService.getAssessment.mockRejectedValue(err);
    const next = vi.fn();
    await getAssessment(makeReq({ params: { id: ASSESSMENT_ID } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ---------------------------------------------------------------------------
// deleteAssessment
// ---------------------------------------------------------------------------

describe('assessmentController.deleteAssessment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 on success', async () => {
    mockService.deleteAssessment.mockResolvedValue(undefined);
    const req = makeReq({ params: { id: ASSESSMENT_ID } });
    const res = makeRes();
    await deleteAssessment(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('passes service errors to next()', async () => {
    const err = Object.assign(new Error('forbidden'), { statusCode: 403 });
    mockService.deleteAssessment.mockRejectedValue(err);
    const next = vi.fn();
    await deleteAssessment(makeReq({ params: { id: ASSESSMENT_ID } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

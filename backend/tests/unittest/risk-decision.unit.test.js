/**
 * Unit Tests — setRiskDecision + setClauseSignoff controller handlers
 *
 * Controllers delegate to assessmentService — these tests verify the HTTP contract.
 * Business logic is covered in assessmentService.unit.test.js.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// Mocks
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
  setRiskDecision: vi.fn(),
  setClauseSignoff: vi.fn(),
}));

vi.mock('../../services/AssessmentService.js', () => ({
  assessmentService: mockService,
}));

// ---------------------------------------------------------------------------
// Subject imports
// ---------------------------------------------------------------------------

import { setRiskDecision, setClauseSignoff } from '../../controllers/assessmentController.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_OID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ASSESSMENT_OID = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

function makeReqRes(bodyOverrides = {}, paramOverrides = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
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

  it('returns 200 with riskDecision from service', async () => {
    const riskDecision = { decision: 'proceed', rationale: 'ok', setAt: new Date() };
    mockService.setRiskDecision.mockResolvedValue(riskDecision);

    const { req, res, next } = makeReqRes({ decision: 'proceed', rationale: 'ok' });
    await setRiskDecision(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.setRiskDecision).toHaveBeenCalledWith(
      ASSESSMENT_OID.toString(),
      'user-abc',
      [WORKSPACE_OID.toString()],
      { decision: 'proceed', rationale: 'ok' }
    );
  });

  it('passes service errors to next()', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 });
    mockService.setRiskDecision.mockRejectedValue(err);
    const { req, res, next } = makeReqRes({ decision: 'proceed' });
    await setRiskDecision(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ---------------------------------------------------------------------------
// setClauseSignoff
// ---------------------------------------------------------------------------

describe('setClauseSignoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with clauseSignoffs from service', async () => {
    const signoffs = [{ clauseRef: 'Art.30(1)', status: 'accepted' }];
    mockService.setClauseSignoff.mockResolvedValue(signoffs);

    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'accepted' });
    await setClauseSignoff(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.setClauseSignoff).toHaveBeenCalledWith(
      ASSESSMENT_OID.toString(),
      'user-abc',
      [WORKSPACE_OID.toString()],
      { clauseRef: 'Art.30(1)', status: 'accepted' }
    );
  });

  it('passes service errors to next()', async () => {
    const err = Object.assign(new Error('framework mismatch'), { statusCode: 400 });
    mockService.setClauseSignoff.mockRejectedValue(err);
    const { req, res, next } = makeReqRes({ clauseRef: 'Art.30(1)', status: 'accepted' });
    await setClauseSignoff(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

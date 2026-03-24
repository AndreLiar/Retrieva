/**
 * Unit Tests — questionnaireController
 *
 * All models, queue, and email service are mocked.
 * Covers: createQuestionnaire, listQuestionnaires, getQuestionnaire,
 *         deleteQuestionnaire, sendQuestionnaire, getPublicForm, submitResponse
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (declared before subject imports) ──────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../models/QuestionnaireTemplate.js', () => ({
  QuestionnaireTemplate: { findOne: vi.fn() },
}));

vi.mock('../../models/VendorQuestionnaire.js', () => ({
  VendorQuestionnaire: {
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../../config/queue.js', () => ({
  questionnaireQueue: { add: vi.fn() },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: { sendQuestionnaireInvitation: vi.fn() },
}));

vi.mock('../../utils/index.js', () => ({
  catchAsync: (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  },
  sendSuccess: (res, status, message, data) => {
    res.status(status).json({ success: true, message, data });
  },
  sendError: (res, status, message) => {
    res.status(status).json({ success: false, message });
  },
  AppError: class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'AppError';
    }
  },
}));

import {
  createQuestionnaire,
  listQuestionnaires,
  getQuestionnaire,
  deleteQuestionnaire,
  sendQuestionnaire,
  getPublicForm,
  submitResponse,
} from '../../controllers/questionnaireController.js';
import { QuestionnaireTemplate } from '../../models/QuestionnaireTemplate.js';
import { VendorQuestionnaire } from '../../models/VendorQuestionnaire.js';
import { questionnaireQueue } from '../../config/queue.js';
import { emailService } from '../../services/emailService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-001';
const WS_ID = 'ws-test-001';
const Q_ID = 'q-test-001';
const TOKEN = 'test-token-abc-uuid';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

function makeReq(overrides = {}) {
  return {
    body: {},
    query: {},
    params: {},
    user: { userId: USER_ID, name: 'Test User', email: 'test@example.com' },
    authorizedWorkspaces: [{ _id: WS_ID, name: 'Test Workspace' }],
    ...overrides,
  };
}

/**
 * Returns an object that works for BOTH usage patterns found in the controller:
 *   await VendorQuestionnaire.findById(id)          → resolves to doc
 *   await VendorQuestionnaire.findById(id).lean()   → resolves to doc
 */
function makeQueryResult(doc) {
  return Object.assign(Promise.resolve(doc), {
    lean: () => Promise.resolve(doc),
  });
}

const MOCK_TEMPLATE = {
  _id: 'tpl-001',
  isDefault: true,
  questions: [
    {
      id: 'q1',
      text: 'Do you have ICT policies?',
      doraArticle: '28',
      category: 'ICT',
      hint: 'Hint',
    },
  ],
};

function makeMockQ(overrides = {}) {
  return {
    _id: Q_ID,
    workspaceId: WS_ID,
    vendorName: 'Acme Corp',
    vendorEmail: 'vendor@acme.com',
    vendorContactName: 'Jane Doe',
    status: 'draft',
    questions: [{ id: 'q1', text: 'Q?', doraArticle: '28', category: 'ICT', answer: '' }],
    token: null,
    tokenExpiresAt: null,
    createdBy: USER_ID,
    createdAt: new Date(),
    deleteOne: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ─── createQuestionnaire ──────────────────────────────────────────────────────

describe('createQuestionnaire', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
  });

  it('returns 400 when vendorName is missing', async () => {
    const req = makeReq({ body: { vendorEmail: 'v@e.com', workspaceId: WS_ID } });
    await createQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 400 when vendorEmail is missing', async () => {
    const req = makeReq({ body: { vendorName: 'Acme', workspaceId: WS_ID } });
    await createQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeReq({ body: { vendorName: 'Acme', vendorEmail: 'v@e.com' } });
    await createQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 when no default template exists', async () => {
    QuestionnaireTemplate.findOne.mockResolvedValue(null);
    const req = makeReq({
      body: { vendorName: 'Acme', vendorEmail: 'v@e.com', workspaceId: WS_ID },
    });
    await createQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('trims and lowercases fields, creates questionnaire, returns 201', async () => {
    QuestionnaireTemplate.findOne.mockResolvedValue(MOCK_TEMPLATE);
    const created = makeMockQ();
    VendorQuestionnaire.create.mockResolvedValue(created);

    const req = makeReq({
      body: {
        vendorName: '  Acme Corp  ',
        vendorEmail: '  VENDOR@Acme.COM  ',
        vendorContactName: '  Jane  ',
        workspaceId: WS_ID,
      },
    });
    await createQuestionnaire(req, res, next);

    expect(VendorQuestionnaire.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorName: 'Acme Corp',
        vendorEmail: 'vendor@acme.com',
        status: 'draft',
        workspaceId: WS_ID,
        createdBy: USER_ID,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── listQuestionnaires ───────────────────────────────────────────────────────

describe('listQuestionnaires', () => {
  let res, next, findChain;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
    findChain = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    VendorQuestionnaire.find.mockReturnValue(findChain);
    VendorQuestionnaire.countDocuments.mockResolvedValue(0);
  });

  it('returns paginated empty list with defaults', async () => {
    const req = makeReq({ query: {} });
    await listQuestionnaires(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questionnaires: [],
          pagination: expect.objectContaining({ page: 1, limit: 20, total: 0 }),
        }),
      })
    );
  });

  it('applies status filter when provided', async () => {
    const req = makeReq({ query: { status: 'complete' } });
    await listQuestionnaires(req, res, next);
    expect(VendorQuestionnaire.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete' })
    );
  });

  it('applies workspaceId filter when provided', async () => {
    const req = makeReq({ query: { workspaceId: WS_ID } });
    await listQuestionnaires(req, res, next);
    expect(VendorQuestionnaire.find).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_ID })
    );
  });

  it('respects custom page and limit', async () => {
    const req = makeReq({ query: { page: '2', limit: '5' } });
    await listQuestionnaires(req, res, next);
    expect(findChain.skip).toHaveBeenCalledWith(5); // (2-1)*5
    expect(findChain.limit).toHaveBeenCalledWith(5);
  });
});

// ─── getQuestionnaire ─────────────────────────────────────────────────────────

describe('getQuestionnaire', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
  });

  it('calls next with 404 AppError when not found', async () => {
    VendorQuestionnaire.findById.mockReturnValue(makeQueryResult(null));
    const req = makeReq({ params: { id: Q_ID } });
    await getQuestionnaire(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('calls next with 403 AppError when workspace not authorized', async () => {
    const q = { workspaceId: { toString: () => 'other-ws' } };
    VendorQuestionnaire.findById.mockReturnValue(makeQueryResult(q));
    const req = makeReq({ params: { id: Q_ID } });
    await getQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('returns 200 with questionnaire when authorized', async () => {
    const q = { workspaceId: { toString: () => WS_ID }, data: 'ok' };
    VendorQuestionnaire.findById.mockReturnValue(makeQueryResult(q));
    const req = makeReq({ params: { id: Q_ID } });
    await getQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ questionnaire: q }) })
    );
  });
});

// ─── deleteQuestionnaire ──────────────────────────────────────────────────────

describe('deleteQuestionnaire', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
    VendorQuestionnaire.findById.mockResolvedValue(null);
  });

  it('calls next with 404 when not found', async () => {
    const req = makeReq({ params: { id: Q_ID } });
    await deleteQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('calls next with 403 when workspace not authorized', async () => {
    const q = makeMockQ({ workspaceId: { toString: () => 'other-ws' } });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await deleteQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('calls next with 403 when user is not the creator', async () => {
    const q = makeMockQ({ workspaceId: { toString: () => WS_ID }, createdBy: 'someone-else' });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await deleteQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('deletes questionnaire and returns 200 when authorized and creator', async () => {
    const q = makeMockQ({ workspaceId: { toString: () => WS_ID }, createdBy: USER_ID });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await deleteQuestionnaire(req, res, next);
    expect(q.deleteOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── sendQuestionnaire ────────────────────────────────────────────────────────

describe('sendQuestionnaire', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
    emailService.sendQuestionnaireInvitation.mockResolvedValue({});
  });

  it('calls next with 404 when not found', async () => {
    VendorQuestionnaire.findById.mockResolvedValue(null);
    const req = makeReq({ params: { id: Q_ID } });
    await sendQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('calls next with 403 when workspace not authorized', async () => {
    const q = makeMockQ({ workspaceId: { toString: () => 'other-ws' } });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await sendQuestionnaire(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('returns 400 when questionnaire is already complete', async () => {
    const q = makeMockQ({ workspaceId: { toString: () => WS_ID }, status: 'complete' });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await sendQuestionnaire(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('sets token, saves, sends invitation email, returns 200', async () => {
    const q = makeMockQ({
      workspaceId: { toString: () => WS_ID },
      status: 'draft',
      _id: { toString: () => Q_ID },
    });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await sendQuestionnaire(req, res, next);

    expect(q.token).toBeTruthy();
    expect(q.status).toBe('sent');
    expect(q.save).toHaveBeenCalled();
    expect(emailService.sendQuestionnaireInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'vendor@acme.com' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses workspace name from authorizedWorkspaces in email', async () => {
    const q = makeMockQ({
      workspaceId: { toString: () => WS_ID },
      status: 'draft',
      _id: { toString: () => Q_ID },
    });
    VendorQuestionnaire.findById.mockResolvedValue(q);
    const req = makeReq({ params: { id: Q_ID } });
    await sendQuestionnaire(req, res, next);

    expect(emailService.sendQuestionnaireInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: 'Test Workspace' })
    );
  });
});

// ─── getPublicForm ────────────────────────────────────────────────────────────

describe('getPublicForm', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
  });

  it('calls next with 404 when token not found', async () => {
    VendorQuestionnaire.findOne.mockReturnValue(makeQueryResult(null));
    const req = makeReq({ params: { token: TOKEN } });
    await getPublicForm(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('returns 200 with alreadyComplete flag when status=complete', async () => {
    VendorQuestionnaire.findOne.mockReturnValue(makeQueryResult(makeMockQ({ status: 'complete' })));
    const req = makeReq({ params: { token: TOKEN } });
    await getPublicForm(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyComplete: true }));
  });

  it('returns 410 and marks expired when tokenExpiresAt is in the past', async () => {
    const q = makeMockQ({ status: 'sent', tokenExpiresAt: new Date(Date.now() - 1000) });
    VendorQuestionnaire.findOne.mockReturnValue(makeQueryResult(q));
    VendorQuestionnaire.findByIdAndUpdate.mockResolvedValue({});
    const req = makeReq({ params: { token: TOKEN } });
    await getPublicForm(req, res, next);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ expired: true }));
    expect(VendorQuestionnaire.findByIdAndUpdate).toHaveBeenCalledWith(q._id, {
      status: 'expired',
    });
  });

  it('returns 200 with questions on valid, non-expired form', async () => {
    const q = makeMockQ({ status: 'sent', tokenExpiresAt: new Date(Date.now() + 86400000) });
    VendorQuestionnaire.findOne.mockReturnValue(makeQueryResult(q));
    const req = makeReq({ params: { token: TOKEN } });
    await getPublicForm(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ questions: expect.any(Array) }),
      })
    );
  });

  it('returns questions even with no tokenExpiresAt set', async () => {
    const q = makeMockQ({ status: 'sent', tokenExpiresAt: null });
    VendorQuestionnaire.findOne.mockReturnValue(makeQueryResult(q));
    const req = makeReq({ params: { token: TOKEN } });
    await getPublicForm(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── submitResponse ───────────────────────────────────────────────────────────

describe('submitResponse', () => {
  let res, next;

  beforeEach(() => {
    res = makeRes();
    next = vi.fn();
    questionnaireQueue.add.mockResolvedValue({});
  });

  it('returns 400 when answers is not an array', async () => {
    const req = makeReq({ params: { token: TOKEN }, body: { answers: 'not-array' } });
    await submitResponse(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(VendorQuestionnaire.findOne).not.toHaveBeenCalled();
  });

  it('calls next with 404 when token not found', async () => {
    VendorQuestionnaire.findOne.mockResolvedValue(null);
    const req = makeReq({ params: { token: TOKEN }, body: { answers: [] } });
    await submitResponse(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('returns 200 alreadyComplete when status=complete', async () => {
    VendorQuestionnaire.findOne.mockResolvedValue(makeMockQ({ status: 'complete' }));
    const req = makeReq({ params: { token: TOKEN }, body: { answers: [] } });
    await submitResponse(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyComplete: true }));
  });

  it('returns 200 alreadyComplete when status=expired', async () => {
    VendorQuestionnaire.findOne.mockResolvedValue(makeMockQ({ status: 'expired' }));
    const req = makeReq({ params: { token: TOKEN }, body: { answers: [] } });
    await submitResponse(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyComplete: true }));
  });

  it('returns 410 and saves expired status when tokenExpiresAt is in the past', async () => {
    const q = makeMockQ({ status: 'sent', tokenExpiresAt: new Date(Date.now() - 1000) });
    VendorQuestionnaire.findOne.mockResolvedValue(q);
    const req = makeReq({ params: { token: TOKEN }, body: { answers: [] } });
    await submitResponse(req, res, next);
    expect(q.status).toBe('expired');
    expect(q.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ expired: true }));
  });

  it('saves partial progress and returns 200 when final is falsy', async () => {
    const q = makeMockQ({
      status: 'sent',
      tokenExpiresAt: new Date(Date.now() + 86400000),
      questions: [{ id: 'q1', answer: '' }],
    });
    VendorQuestionnaire.findOne.mockResolvedValue(q);
    const req = makeReq({
      params: { token: TOKEN },
      body: { answers: [{ id: 'q1', answer: 'Yes' }], final: false },
    });
    await submitResponse(req, res, next);

    expect(q.questions[0].answer).toBe('Yes');
    expect(q.save).toHaveBeenCalled();
    expect(questionnaireQueue.add).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ final: false }) })
    );
  });

  it('marks as partial, enqueues scoring job, returns 200 when final=true', async () => {
    const q = makeMockQ({
      status: 'sent',
      tokenExpiresAt: new Date(Date.now() + 86400000),
      _id: { toString: () => Q_ID },
      questions: [{ id: 'q1', answer: '' }],
    });
    VendorQuestionnaire.findOne.mockResolvedValue(q);
    const req = makeReq({
      params: { token: TOKEN },
      body: { answers: [{ id: 'q1', answer: 'Yes' }], final: true },
    });
    await submitResponse(req, res, next);

    expect(q.status).toBe('partial');
    expect(q.save).toHaveBeenCalled();
    expect(questionnaireQueue.add).toHaveBeenCalledWith(
      'scoreQuestionnaire',
      expect.objectContaining({ questionnaireId: Q_ID }),
      expect.objectContaining({ jobId: `scoreQuestionnaire-${Q_ID}` })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ final: true }) })
    );
  });
});

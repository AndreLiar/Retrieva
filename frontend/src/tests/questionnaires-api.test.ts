/**
 * Frontend Tests — questionnairesApi client
 *
 * Mocks both the authenticated apiClient (via @/lib/api/client) and the
 * public axios instance (via axios.create) used by getPublicForm / submitResponse.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock functions before any module evaluation
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockDelete, mockPublicGet, mockPublicPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
  mockPublicGet: vi.fn(),
  mockPublicPost: vi.fn(),
}));

// Mock authenticated apiClient
vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}));

// Mock axios so that axios.create() returns a public client stub
vi.mock('axios', () => ({
  default: {
    create: () => ({ get: mockPublicGet, post: mockPublicPost }),
  },
}));

import { questionnairesApi } from '@/lib/api/questionnaires';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const MOCK_QUESTIONNAIRE = {
  _id: 'q-001',
  workspaceId: 'ws-001',
  vendorName: 'Acme Corp',
  vendorEmail: 'vendor@acme.com',
  status: 'draft' as const,
  questions: [],
  createdBy: 'user-001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('questionnairesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('calls POST /questionnaires with the dto', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: MOCK_QUESTIONNAIRE } },
      });

      const dto = { vendorName: 'Acme', vendorEmail: 'a@b.com', workspaceId: 'ws-001' };
      await questionnairesApi.create(dto);

      expect(mockPost).toHaveBeenCalledWith('/questionnaires', dto);
    });

    it('returns the created questionnaire', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: MOCK_QUESTIONNAIRE } },
      });

      const result = await questionnairesApi.create({
        vendorName: 'Acme',
        vendorEmail: 'a@b.com',
        workspaceId: 'ws-001',
      });

      expect(result.data!.questionnaire._id).toBe('q-001');
    });

    it('propagates errors', async () => {
      mockPost.mockRejectedValue(new Error('Conflict'));
      await expect(
        questionnairesApi.create({ vendorName: 'Acme', vendorEmail: 'a@b.com', workspaceId: 'ws-001' })
      ).rejects.toThrow('Conflict');
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list()', () => {
    it('calls GET /questionnaires with no params when called with no args', async () => {
      mockGet.mockResolvedValue({
        data: {
          status: 'success',
          data: {
            questionnaires: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 },
          },
        },
      });

      await questionnairesApi.list();

      expect(mockGet).toHaveBeenCalledWith('/questionnaires', { params: undefined });
    });

    it('passes filters as query params', async () => {
      mockGet.mockResolvedValue({
        data: {
          status: 'success',
          data: { questionnaires: [MOCK_QUESTIONNAIRE], pagination: { page: 1, limit: 10, total: 1, pages: 1 } },
        },
      });

      await questionnairesApi.list({ workspaceId: 'ws-001', status: 'draft', page: 1, limit: 10 });

      expect(mockGet).toHaveBeenCalledWith('/questionnaires', {
        params: { workspaceId: 'ws-001', status: 'draft', page: 1, limit: 10 },
      });
    });

    it('returns questionnaires array', async () => {
      mockGet.mockResolvedValue({
        data: {
          status: 'success',
          data: {
            questionnaires: [MOCK_QUESTIONNAIRE],
            pagination: { page: 1, limit: 20, total: 1, pages: 1 },
          },
        },
      });

      const result = await questionnairesApi.list();
      expect(result.data!.questionnaires).toHaveLength(1);
      expect(result.data!.questionnaires[0].vendorName).toBe('Acme Corp');
    });
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('calls GET /questionnaires/:id', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: MOCK_QUESTIONNAIRE } },
      });

      await questionnairesApi.get('q-001');

      expect(mockGet).toHaveBeenCalledWith('/questionnaires/q-001');
    });

    it('returns the questionnaire', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: MOCK_QUESTIONNAIRE } },
      });

      const result = await questionnairesApi.get('q-001');
      expect(result.data!.questionnaire.vendorEmail).toBe('vendor@acme.com');
    });

    it('propagates 404 errors', async () => {
      const err = Object.assign(new Error('Not found'), { response: { status: 404 } });
      mockGet.mockRejectedValue(err);
      await expect(questionnairesApi.get('missing')).rejects.toMatchObject({ response: { status: 404 } });
    });
  });

  // -------------------------------------------------------------------------
  // send
  // -------------------------------------------------------------------------
  describe('send()', () => {
    it('calls POST /questionnaires/:id/send', async () => {
      const sent = { ...MOCK_QUESTIONNAIRE, status: 'sent' as const };
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: sent } },
      });

      await questionnairesApi.send('q-001');

      expect(mockPost).toHaveBeenCalledWith('/questionnaires/q-001/send');
    });

    it('returns the updated questionnaire with sent status', async () => {
      const sent = { ...MOCK_QUESTIONNAIRE, status: 'sent' as const };
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { questionnaire: sent } },
      });

      const result = await questionnairesApi.send('q-001');
      expect(result.data!.questionnaire.status).toBe('sent');
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('calls DELETE /questionnaires/:id', async () => {
      mockDelete.mockResolvedValue({
        data: { status: 'success', data: null },
      });

      await questionnairesApi.delete('q-001');

      expect(mockDelete).toHaveBeenCalledWith('/questionnaires/q-001');
    });

    it('returns success response', async () => {
      mockDelete.mockResolvedValue({
        data: { status: 'success', data: null },
      });

      const result = await questionnairesApi.delete('q-001');
      expect(result.status).toBe('success');
    });

    it('propagates 403 when user is not the creator', async () => {
      const err = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
      mockDelete.mockRejectedValue(err);
      await expect(questionnairesApi.delete('q-001')).rejects.toMatchObject({ response: { status: 403 } });
    });
  });

  // -------------------------------------------------------------------------
  // getPublicForm (no auth — uses publicClient)
  // -------------------------------------------------------------------------
  describe('getPublicForm()', () => {
    it('calls GET /questionnaires/respond/:token via public client', async () => {
      mockPublicGet.mockResolvedValue({
        data: {
          status: 'success',
          data: {
            vendorName: 'Acme Corp',
            status: 'sent',
            questions: [],
          },
        },
      });

      await questionnairesApi.getPublicForm('token-abc');

      expect(mockPublicGet).toHaveBeenCalledWith('/questionnaires/respond/token-abc');
    });

    it('returns the vendor form data', async () => {
      const questions = [{ id: 'q1', text: 'Q?', doraArticle: '28', category: 'ICT' }];
      mockPublicGet.mockResolvedValue({
        data: {
          status: 'success',
          data: { vendorName: 'Acme Corp', status: 'sent', questions },
        },
      });

      const result = await questionnairesApi.getPublicForm('token-abc');
      expect(result.data!.vendorName).toBe('Acme Corp');
      expect(result.data!.questions).toHaveLength(1);
    });

    it('returns alreadyComplete flag when set', async () => {
      mockPublicGet.mockResolvedValue({
        data: {
          status: 'success',
          data: { vendorName: 'Acme', status: 'complete', questions: [], alreadyComplete: true },
        },
      });

      const result = await questionnairesApi.getPublicForm('token-done');
      expect(result.data!.alreadyComplete).toBe(true);
    });

    it('returns expired flag when token is expired', async () => {
      mockPublicGet.mockResolvedValue({
        data: {
          status: 'success',
          data: {
            vendorName: 'Acme',
            status: 'expired',
            questions: [],
            expired: true,
            message: 'This form has expired.',
          },
        },
      });

      const result = await questionnairesApi.getPublicForm('expired-token');
      expect(result.data!.expired).toBe(true);
      expect(result.data!.message).toBe('This form has expired.');
    });

    it('propagates errors from the public client', async () => {
      mockPublicGet.mockRejectedValue(new Error('Network Error'));
      await expect(questionnairesApi.getPublicForm('token-xyz')).rejects.toThrow('Network Error');
    });
  });

  // -------------------------------------------------------------------------
  // submitResponse (no auth — uses publicClient)
  // -------------------------------------------------------------------------
  describe('submitResponse()', () => {
    it('calls POST /questionnaires/respond/:token via public client', async () => {
      mockPublicPost.mockResolvedValue({
        data: { status: 'success', data: { saved: true, final: false } },
      });

      const body = { answers: [{ id: 'q1', answer: 'Yes' }], final: false };
      await questionnairesApi.submitResponse('token-abc', body);

      expect(mockPublicPost).toHaveBeenCalledWith('/questionnaires/respond/token-abc', body);
    });

    it('returns saved and final flags for partial submission', async () => {
      mockPublicPost.mockResolvedValue({
        data: { status: 'success', data: { saved: true, final: false } },
      });

      const result = await questionnairesApi.submitResponse('token-abc', {
        answers: [{ id: 'q1', answer: 'Partial' }],
        final: false,
      });

      expect(result.data!.saved).toBe(true);
      expect(result.data!.final).toBe(false);
    });

    it('returns alreadyComplete flag when resubmitting', async () => {
      mockPublicPost.mockResolvedValue({
        data: { status: 'success', data: { saved: false, final: true, alreadyComplete: true } },
      });

      const result = await questionnairesApi.submitResponse('token-done', {
        answers: [],
        final: true,
      });

      expect(result.data!.alreadyComplete).toBe(true);
    });

    it('propagates errors from the public client', async () => {
      mockPublicPost.mockRejectedValue(new Error('Gone'));
      await expect(
        questionnairesApi.submitResponse('expired', { answers: [], final: true })
      ).rejects.toThrow('Gone');
    });
  });
});

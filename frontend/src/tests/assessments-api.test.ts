/**
 * Frontend Tests — assessmentsApi client
 *
 * All tests mock the Axios client instance so no real HTTP requests are made.
 * Covers: list, get, create, delete, downloadReport
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Assessment, AssessmentListResponse } from '@/lib/api/assessments';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing assessmentsApi
// vi.hoisted ensures mock fns are created before vi.mock() factory runs
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}));

import { assessmentsApi } from '@/lib/api/assessments';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAssessment: Assessment = {
  _id: 'aaa111',
  workspaceId: 'ws-001',
  name: 'Q1 DORA Assessment',
  vendorName: 'Acme Corp',
  framework: 'DORA',
  status: 'pending',
  statusMessage: 'Queued…',
  documents: [],
  createdBy: 'user-001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockListData: AssessmentListResponse = {
  assessments: [mockAssessment],
  pagination: { page: 1, limit: 20, total: 1, pages: 1 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assessmentsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list()', () => {
    it('calls GET /assessments without params', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: mockListData } });
      const result = await assessmentsApi.list();
      expect(mockGet).toHaveBeenCalledWith('/assessments', { params: undefined });
      expect(result.data).toEqual(mockListData);
    });

    it('passes workspaceId filter as query param', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: mockListData } });
      await assessmentsApi.list({ workspaceId: 'ws-001' });
      expect(mockGet).toHaveBeenCalledWith('/assessments', {
        params: { workspaceId: 'ws-001' },
      });
    });

    it('passes status filter as query param', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: mockListData } });
      await assessmentsApi.list({ status: 'complete' });
      expect(mockGet).toHaveBeenCalledWith('/assessments', {
        params: { status: 'complete' },
      });
    });

    it('passes pagination params', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: mockListData } });
      await assessmentsApi.list({ page: 2, limit: 10 });
      expect(mockGet).toHaveBeenCalledWith('/assessments', {
        params: { page: 2, limit: 10 },
      });
    });

    it('returns the response data', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: mockListData } });
      const result = await assessmentsApi.list();
      expect(result.status).toBe('success');
      expect(result.data.assessments).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('calls GET /assessments/:id with the given id', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { assessment: mockAssessment } },
      });
      await assessmentsApi.get('aaa111');
      expect(mockGet).toHaveBeenCalledWith('/assessments/aaa111');
    });

    it('returns the assessment data', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { assessment: mockAssessment } },
      });
      const result = await assessmentsApi.get('aaa111');
      expect(result.data.assessment._id).toBe('aaa111');
      expect(result.data.assessment.name).toBe('Q1 DORA Assessment');
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('calls POST /assessments with FormData and multipart/form-data header', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { assessment: mockAssessment } },
      });
      const formData = new FormData();
      formData.append('name', 'Test Assessment');

      await assessmentsApi.create(formData);

      expect(mockPost).toHaveBeenCalledWith(
        '/assessments',
        formData,
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
    });

    it('sets a 2-minute timeout for file uploads', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { assessment: mockAssessment } },
      });
      const formData = new FormData();
      await assessmentsApi.create(formData);

      expect(mockPost).toHaveBeenCalledWith(
        '/assessments',
        formData,
        expect.objectContaining({ timeout: 120_000 })
      );
    });

    it('returns the created assessment', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { assessment: mockAssessment } },
      });
      const result = await assessmentsApi.create(new FormData());
      expect(result.data.assessment.vendorName).toBe('Acme Corp');
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('calls DELETE /assessments/:id with the given id', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      await assessmentsApi.delete('aaa111');
      expect(mockDelete).toHaveBeenCalledWith('/assessments/aaa111');
    });

    it('returns the response data', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      const result = await assessmentsApi.delete('aaa111');
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // downloadReport
  // -------------------------------------------------------------------------
  describe('downloadReport()', () => {
    it('calls GET /assessments/:id/report with blob responseType', async () => {
      // Mock URL and DOM APIs used by downloadReport
      const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURL = vi.fn();
      const clickFn = vi.fn();
      const appendChildFn = vi.fn();
      const removeChildFn = vi.fn();

      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      Object.assign(document.body, { appendChild: appendChildFn, removeChild: removeChildFn });

      // Mock createElement to return a controlled anchor
      const mockLink = { href: '', setAttribute: vi.fn(), click: clickFn, remove: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);

      mockGet.mockResolvedValue({ data: new Blob(['mock-docx']) });

      await assessmentsApi.downloadReport('aaa111', 'Acme Corp');

      expect(mockGet).toHaveBeenCalledWith('/assessments/aaa111/report', {
        responseType: 'blob',
        timeout: 60_000,
      });
    });

    it('triggers file download with correct filename format', async () => {
      const mockLink = { href: '', setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock'),
        revokeObjectURL: vi.fn(),
      });
      mockGet.mockResolvedValue({ data: new Blob(['mock']) });

      await assessmentsApi.downloadReport('bbb222', 'Vendor Name With Spaces');

      const filenameCall = mockLink.setAttribute.mock.calls.find(([attr]) => attr === 'download');
      expect(filenameCall).toBeDefined();
      const filename = filenameCall![1] as string;
      expect(filename).toMatch(/^DORA_Assessment_Vendor_Name_With_Spaces_\d{4}-\d{2}-\d{2}\.docx$/);
    });
  });
});

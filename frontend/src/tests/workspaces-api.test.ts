/**
 * Frontend Tests — workspacesApi client
 *
 * All tests mock the Axios client so no real HTTP requests are made.
 * Covers: list, get, create, update, delete, members.list, members.invite,
 * members.update, members.remove, exportRoi (blob download)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing workspacesApi
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

import { workspacesApi } from '@/lib/api/workspaces';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockWorkspace = {
  _id: 'ws-001',
  name: 'Acme Corp',
  description: 'Test vendor workspace',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockWorkspaceWithMembership = {
  ...mockWorkspace,
  role: 'owner',
  permissions: { canEdit: true, canDelete: true, canInvite: true },
};

const mockMembership = {
  _id: 'mem-001',
  userId: 'user-001',
  workspaceId: 'ws-001',
  role: 'member',
};

const mockMemberWithUser = {
  ...mockMembership,
  user: { email: 'bob@example.com', name: 'Bob Martin' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workspacesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list()', () => {
    it('calls GET /workspaces/my-workspaces', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { workspaces: [mockWorkspaceWithMembership] } },
      });
      await workspacesApi.list();
      expect(mockGet).toHaveBeenCalledWith('/workspaces/my-workspaces');
    });

    it('returns workspaces array', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { workspaces: [mockWorkspaceWithMembership] } },
      });
      const result = await workspacesApi.list();
      expect(result.data.workspaces).toHaveLength(1);
      expect(result.data.workspaces[0].id).toBe('ws-001');
      expect(result.data.workspaces[0].membership.role).toBe('owner');
    });
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('calls GET /workspaces/:id', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { workspace: mockWorkspaceWithMembership } },
      });
      await workspacesApi.get('ws-001');
      expect(mockGet).toHaveBeenCalledWith('/workspaces/ws-001');
    });

    it('returns the workspace data', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { workspace: mockWorkspaceWithMembership } },
      });
      const result = await workspacesApi.get('ws-001');
      expect(result.data.workspace.name).toBe('Acme Corp');
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('calls POST /workspaces with workspace data', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { workspace: mockWorkspace } },
      });
      await workspacesApi.create({ name: 'Acme Corp', description: 'Test vendor workspace' });
      expect(mockPost).toHaveBeenCalledWith('/workspaces', {
        name: 'Acme Corp',
        description: 'Test vendor workspace',
      });
    });

    it('passes optional vendor fields', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { workspace: mockWorkspace } },
      });
      await workspacesApi.create({ name: 'Acme', vendorTier: 'critical', country: 'FR' });
      expect(mockPost).toHaveBeenCalledWith('/workspaces', {
        name: 'Acme',
        vendorTier: 'critical',
        country: 'FR',
      });
    });

    it('returns the created workspace', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { workspace: mockWorkspace } },
      });
      const result = await workspacesApi.create({ name: 'Acme Corp' });
      expect(result.data.workspace._id).toBe('ws-001');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('calls PATCH /workspaces/:id with updated fields', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { workspace: { ...mockWorkspace, name: 'New Name' } } },
      });
      await workspacesApi.update('ws-001', { name: 'New Name' });
      expect(mockPatch).toHaveBeenCalledWith('/workspaces/ws-001', { name: 'New Name' });
    });

    it('returns updated workspace', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { workspace: { ...mockWorkspace, name: 'New Name' } } },
      });
      const result = await workspacesApi.update('ws-001', { name: 'New Name' });
      expect(result.data.workspace.name).toBe('New Name');
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('calls DELETE /workspaces/:id', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      await workspacesApi.delete('ws-001');
      expect(mockDelete).toHaveBeenCalledWith('/workspaces/ws-001');
    });

    it('returns success response', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      const result = await workspacesApi.delete('ws-001');
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // members.list
  // -------------------------------------------------------------------------
  describe('members.list()', () => {
    it('calls GET /workspaces/:id/members', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { members: [mockMemberWithUser] } },
      });
      await workspacesApi.members.list('ws-001');
      expect(mockGet).toHaveBeenCalledWith('/workspaces/ws-001/members');
    });

    it('returns members array with user details', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { members: [mockMemberWithUser] } },
      });
      const result = await workspacesApi.members.list('ws-001');
      expect(result.data.members).toHaveLength(1);
      expect(result.data.members[0].user.email).toBe('bob@example.com');
    });
  });

  // -------------------------------------------------------------------------
  // members.invite
  // -------------------------------------------------------------------------
  describe('members.invite()', () => {
    it('calls POST /workspaces/:id/invite with invite data', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { membership: mockMembership } },
      });
      await workspacesApi.members.invite('ws-001', { email: 'bob@example.com', role: 'member' });
      expect(mockPost).toHaveBeenCalledWith('/workspaces/ws-001/invite', {
        email: 'bob@example.com',
        role: 'member',
      });
    });

    it('passes custom permissions', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { membership: mockMembership } },
      });
      const inviteData = {
        email: 'bob@example.com',
        role: 'viewer' as const,
        permissions: { canEdit: false },
      };
      await workspacesApi.members.invite('ws-001', inviteData);
      expect(mockPost).toHaveBeenCalledWith('/workspaces/ws-001/invite', inviteData);
    });

    it('returns the new membership', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { membership: mockMembership } },
      });
      const result = await workspacesApi.members.invite('ws-001', {
        email: 'bob@example.com',
        role: 'member',
      });
      expect(result.data.membership._id).toBe('mem-001');
    });
  });

  // -------------------------------------------------------------------------
  // members.update
  // -------------------------------------------------------------------------
  describe('members.update()', () => {
    it('calls PATCH /workspaces/:id/members/:memberId with updated role', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { membership: { ...mockMembership, role: 'owner' } } },
      });
      await workspacesApi.members.update('ws-001', 'mem-001', { role: 'owner' });
      expect(mockPatch).toHaveBeenCalledWith('/workspaces/ws-001/members/mem-001', { role: 'owner' });
    });

    it('returns updated membership', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { membership: { ...mockMembership, role: 'owner' } } },
      });
      const result = await workspacesApi.members.update('ws-001', 'mem-001', { role: 'owner' });
      expect(result.data.membership.role).toBe('owner');
    });
  });

  // -------------------------------------------------------------------------
  // members.remove
  // -------------------------------------------------------------------------
  describe('members.remove()', () => {
    it('calls DELETE /workspaces/:id/members/:memberId', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      await workspacesApi.members.remove('ws-001', 'mem-001');
      expect(mockDelete).toHaveBeenCalledWith('/workspaces/ws-001/members/mem-001');
    });

    it('returns success response', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      const result = await workspacesApi.members.remove('ws-001', 'mem-001');
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // exportRoi (blob download)
  // -------------------------------------------------------------------------
  describe('exportRoi()', () => {
    it('calls GET /workspaces/roi-export with blob responseType and 60s timeout', async () => {
      const mockBlob = new Blob(['fake-xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      mockGet.mockResolvedValue({ data: mockBlob });

      // Stub DOM APIs used for file download
      const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

      const mockLink = { href: '', setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);

      await workspacesApi.exportRoi();

      expect(mockGet).toHaveBeenCalledWith('/workspaces/roi-export', {
        responseType: 'blob',
        timeout: 60_000,
      });
    });

    it('triggers download with date-stamped XLSX filename', async () => {
      const mockBlob = new Blob(['fake-xlsx']);
      mockGet.mockResolvedValue({ data: mockBlob });

      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock'),
        revokeObjectURL: vi.fn(),
      });

      const mockLink = { href: '', setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);

      await workspacesApi.exportRoi();

      const downloadCall = mockLink.setAttribute.mock.calls.find(([attr]) => attr === 'download');
      expect(downloadCall).toBeDefined();
      const filename = downloadCall![1] as string;
      expect(filename).toMatch(/^DORA_Register_of_Information_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('clicks the link to trigger the download', async () => {
      const mockBlob = new Blob(['fake-xlsx']);
      mockGet.mockResolvedValue({ data: mockBlob });

      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:mock'),
        revokeObjectURL: vi.fn(),
      });

      const clickFn = vi.fn();
      const mockLink = { href: '', setAttribute: vi.fn(), click: clickFn, remove: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);

      await workspacesApi.exportRoi();

      expect(clickFn).toHaveBeenCalledOnce();
    });
  });
});

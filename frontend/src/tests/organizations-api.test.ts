/**
 * Frontend Tests — organizationsApi client
 *
 * Covers: create, getMe, getInviteInfo, invite, acceptInvite,
 *         getMembers, removeMember
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrgMember, OrganizationData } from '@/lib/api/organizations';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing organizationsApi
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet:    vi.fn(),
  mockPost:   vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: { get: mockGet, post: mockPost, delete: mockDelete },
}));

import { organizationsApi } from '@/lib/api/organizations';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockOrg: OrganizationData = {
  id:       'org-001',
  name:     'HDI Global SE',
  industry: 'insurance',
  country:  'Germany',
};

const mockMember: OrgMember = {
  id:     'mbr-001',
  email:  'alice@hdi.de',
  role:   'org_admin',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'user-001', name: 'Alice', email: 'alice@hdi.de' },
};

const pendingMember: OrgMember = {
  id:     'mbr-002',
  email:  'bob@hdi.de',
  role:   'analyst',
  status: 'pending',
  user:   null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('organizationsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('calls POST /organizations with org data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: { organization: mockOrg } } });
      await organizationsApi.create({ name: 'HDI Global SE', industry: 'insurance', country: 'Germany' });
      expect(mockPost).toHaveBeenCalledWith('/organizations', {
        name: 'HDI Global SE', industry: 'insurance', country: 'Germany',
      });
    });

    it('returns the created organization', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: { organization: mockOrg } } });
      const result = await organizationsApi.create({ name: 'HDI Global SE', industry: 'insurance', country: 'Germany' });
      expect(result.data.organization.name).toBe('HDI Global SE');
      expect(result.data.organization.industry).toBe('insurance');
    });
  });

  // -------------------------------------------------------------------------
  // getMe
  // -------------------------------------------------------------------------
  describe('getMe()', () => {
    it('calls GET /organizations/me', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { organization: mockOrg, role: 'org_admin' } } });
      await organizationsApi.getMe();
      expect(mockGet).toHaveBeenCalledWith('/organizations/me');
    });

    it('returns organization and role', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { organization: mockOrg, role: 'analyst' } } });
      const result = await organizationsApi.getMe();
      expect(result.data.organization.id).toBe('org-001');
      expect(result.data.role).toBe('analyst');
    });

    it('returns null organization when user has no org', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { organization: null, role: null } } });
      const result = await organizationsApi.getMe();
      expect(result.data.organization).toBeNull();
      expect(result.data.role).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getInviteInfo
  // -------------------------------------------------------------------------
  describe('getInviteInfo()', () => {
    it('calls GET /organizations/invite-info with encoded token', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { organizationName: 'HDI Global SE', inviterName: 'Alice', role: 'analyst', email: 'bob@hdi.de' } },
      });
      await organizationsApi.getInviteInfo('tok123');
      expect(mockGet).toHaveBeenCalledWith('/organizations/invite-info?token=tok123');
    });

    it('returns invite metadata', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { organizationName: 'HDI Global SE', inviterName: 'Alice', role: 'viewer', email: 'bob@hdi.de' } },
      });
      const result = await organizationsApi.getInviteInfo('tok123');
      expect(result.data.organizationName).toBe('HDI Global SE');
      expect(result.data.role).toBe('viewer');
      expect(result.data.email).toBe('bob@hdi.de');
    });

    it('URL-encodes special characters in token', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: {} } });
      await organizationsApi.getInviteInfo('a+b/c=d');
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('a+b/c=d'))
      );
    });
  });

  // -------------------------------------------------------------------------
  // invite
  // -------------------------------------------------------------------------
  describe('invite()', () => {
    it('calls POST /organizations/invite with email and role', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: { member: pendingMember } } });
      await organizationsApi.invite({ email: 'bob@hdi.de', role: 'analyst' });
      expect(mockPost).toHaveBeenCalledWith('/organizations/invite', { email: 'bob@hdi.de', role: 'analyst' });
    });

    it('returns the pending member', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: { member: pendingMember } } });
      const result = await organizationsApi.invite({ email: 'bob@hdi.de', role: 'analyst' });
      expect(result.data.member.status).toBe('pending');
      expect(result.data.member.role).toBe('analyst');
    });
  });

  // -------------------------------------------------------------------------
  // acceptInvite
  // -------------------------------------------------------------------------
  describe('acceptInvite()', () => {
    it('calls POST /organizations/accept-invite with token in body', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await organizationsApi.acceptInvite('tok456');
      expect(mockPost).toHaveBeenCalledWith('/organizations/accept-invite', { token: 'tok456' });
    });

    it('returns the response data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      const result = await organizationsApi.acceptInvite('tok456');
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // getMembers
  // -------------------------------------------------------------------------
  describe('getMembers()', () => {
    it('calls GET /organizations/members', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { members: [mockMember] } } });
      await organizationsApi.getMembers();
      expect(mockGet).toHaveBeenCalledWith('/organizations/members');
    });

    it('returns member list with user details', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { members: [mockMember, pendingMember] } },
      });
      const result = await organizationsApi.getMembers();
      expect(result.data.members).toHaveLength(2);
      expect(result.data.members[0].user?.name).toBe('Alice');
      expect(result.data.members[1].status).toBe('pending');
    });
  });

  // -------------------------------------------------------------------------
  // removeMember
  // -------------------------------------------------------------------------
  describe('removeMember()', () => {
    it('calls DELETE /organizations/members/:memberId', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      await organizationsApi.removeMember('mbr-001');
      expect(mockDelete).toHaveBeenCalledWith('/organizations/members/mbr-001');
    });

    it('returns success response', async () => {
      mockDelete.mockResolvedValue({ data: { status: 'success' } });
      const result = await organizationsApi.removeMember('mbr-002');
      expect(result.status).toBe('success');
    });
  });
});

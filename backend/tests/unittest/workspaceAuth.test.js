/**
 * Unit Tests for Workspace Auth Middleware
 *
 * Tests the workspace authorization middleware functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../models/WorkspaceMember.js', () => ({
  WorkspaceMember: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../models/NotionWorkspace.js', () => ({
  NotionWorkspace: {
    findById: vi.fn(),
  },
}));

import {
  requireWorkspaceAccess,
  requireWorkspaceOwner,
  canInviteMembers,
  getUserWorkspaceIds,
} from '../../middleware/workspaceAuth.js';
import { WorkspaceMember } from '../../models/WorkspaceMember.js';
import { NotionWorkspace } from '../../models/NotionWorkspace.js';

describe('Workspace Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      path: '/test',
      ip: '127.0.0.1',
      params: {},
      body: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  // ============================================================================
  // requireWorkspaceAccess tests
  // ============================================================================
  describe('requireWorkspaceAccess', () => {
    it('should return 401 when no user authenticated', async () => {
      mockReq.user = null;

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Authentication required'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user has no workspace memberships', async () => {
      mockReq.user = { userId: 'user-123' };

      const mockFind = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      });
      WorkspaceMember.find.mockReturnValue({ populate: vi.fn().mockResolvedValue([]) });

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('do not have access'),
        })
      );
    });

    it('should return 403 when all workspaces are in error state', async () => {
      mockReq.user = { userId: 'user-123' };

      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue([
          {
            workspaceId: {
              _id: 'ws-1',
              workspaceId: 'notion-ws-1',
              syncStatus: 'error',
            },
            role: 'member',
            permissions: { canQuery: true },
          },
        ]),
      });

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('No active workspaces'),
        })
      );
    });

    it('should attach authorized workspaces and call next on success', async () => {
      mockReq.user = { userId: 'user-123' };

      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue([
          {
            workspaceId: {
              _id: 'ws-1',
              workspaceId: 'notion-ws-1',
              workspaceName: 'Test Workspace',
              syncStatus: 'completed',
            },
            role: 'member',
            permissions: { canQuery: true },
          },
        ]),
      });

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockReq.authorizedWorkspaces).toHaveLength(1);
      expect(mockReq.authorizedWorkspaces[0]).toMatchObject({
        _id: 'ws-1',
        workspaceId: 'notion-ws-1',
        workspaceName: 'Test Workspace',
        role: 'member',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should filter out null workspace references', async () => {
      mockReq.user = { userId: 'user-123' };

      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue([
          {
            workspaceId: null, // Deleted workspace
            role: 'member',
          },
          {
            workspaceId: {
              _id: 'ws-2',
              workspaceId: 'notion-ws-2',
              workspaceName: 'Valid Workspace',
              syncStatus: 'completed',
            },
            role: 'member',
            permissions: { canQuery: true },
          },
        ]),
      });

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockReq.authorizedWorkspaces).toHaveLength(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      mockReq.user = { userId: 'user-123' };

      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockRejectedValue(new Error('Database error')),
      });

      await requireWorkspaceAccess(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authorization check failed',
        })
      );
    });
  });

  // ============================================================================
  // requireWorkspaceOwner tests
  // ============================================================================
  describe('requireWorkspaceOwner', () => {
    it('should return 401 when no user authenticated', async () => {
      mockReq.user = null;

      await requireWorkspaceOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no workspace ID provided', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = {};
      mockReq.body = {};

      await requireWorkspaceOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Workspace ID required',
        })
      );
    });

    it('should return 403 when user is not owner', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      WorkspaceMember.findOne.mockResolvedValue(null);

      await requireWorkspaceOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Only workspace owners'),
        })
      );
    });

    it('should call next when user is owner', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      WorkspaceMember.findOne.mockResolvedValue({
        userId: 'user-123',
        workspaceId: 'ws-1',
        role: 'owner',
        status: 'active',
      });

      const mockWorkspace = { _id: 'ws-1', workspaceName: 'Test' };
      NotionWorkspace.findById.mockResolvedValue(mockWorkspace);

      await requireWorkspaceOwner(mockReq, mockRes, mockNext);

      expect(mockReq.workspace).toEqual(mockWorkspace);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should get workspace ID from body if not in params', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = {};
      mockReq.body = { workspaceId: 'ws-1' };

      WorkspaceMember.findOne.mockResolvedValue({
        userId: 'user-123',
        workspaceId: 'ws-1',
        role: 'owner',
        status: 'active',
      });

      NotionWorkspace.findById.mockResolvedValue({ _id: 'ws-1' });

      await requireWorkspaceOwner(mockReq, mockRes, mockNext);

      expect(WorkspaceMember.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // canInviteMembers tests
  // ============================================================================
  describe('canInviteMembers', () => {
    it('should return 401 when no user authenticated', async () => {
      mockReq.user = null;

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no workspace ID provided', async () => {
      mockReq.user = { userId: 'user-123' };

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 403 when user is not a member', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      WorkspaceMember.findOne.mockResolvedValue(null);

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not a member'),
        })
      );
    });

    it('should return 403 when member cannot invite', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      WorkspaceMember.findOne.mockResolvedValue({
        role: 'member',
        permissions: { canInvite: false },
      });

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('permission to invite'),
        })
      );
    });

    it('should call next when user is owner', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      const membership = {
        role: 'owner',
        permissions: { canInvite: false }, // Doesn't matter for owner
      };
      WorkspaceMember.findOne.mockResolvedValue(membership);

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockReq.membership).toEqual(membership);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next when member has invite permission', async () => {
      mockReq.user = { userId: 'user-123' };
      mockReq.params = { workspaceId: 'ws-1' };

      const membership = {
        role: 'member',
        permissions: { canInvite: true },
      };
      WorkspaceMember.findOne.mockResolvedValue(membership);

      await canInviteMembers(mockReq, mockRes, mockNext);

      expect(mockReq.membership).toEqual(membership);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getUserWorkspaceIds tests
  // ============================================================================
  describe('getUserWorkspaceIds', () => {
    it('should return array of workspace IDs', async () => {
      WorkspaceMember.find.mockReturnValue({
        populate: vi
          .fn()
          .mockResolvedValue([
            { workspaceId: { workspaceId: 'notion-ws-1' } },
            { workspaceId: { workspaceId: 'notion-ws-2' } },
          ]),
      });

      const result = await getUserWorkspaceIds('user-123');

      expect(result).toEqual(['notion-ws-1', 'notion-ws-2']);
    });

    it('should filter out null workspace references', async () => {
      WorkspaceMember.find.mockReturnValue({
        populate: vi
          .fn()
          .mockResolvedValue([
            { workspaceId: null },
            { workspaceId: { workspaceId: 'notion-ws-2' } },
          ]),
      });

      const result = await getUserWorkspaceIds('user-123');

      expect(result).toEqual(['notion-ws-2']);
    });

    it('should return empty array when no memberships', async () => {
      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      });

      const result = await getUserWorkspaceIds('user-123');

      expect(result).toEqual([]);
    });

    it('should query for active memberships with canQuery permission', async () => {
      WorkspaceMember.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      });

      await getUserWorkspaceIds('user-123');

      expect(WorkspaceMember.find).toHaveBeenCalledWith({
        userId: 'user-123',
        status: 'active',
        'permissions.canQuery': true,
      });
    });
  });
});

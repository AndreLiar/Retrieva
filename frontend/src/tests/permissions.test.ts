/**
 * Permissions Utility Unit Tests
 *
 * Tests for permission checking functions
 */

import { describe, it, expect } from 'vitest';
import {
  hasGlobalRole,
  isAdmin,
  hasWorkspaceRole,
  hasPermission,
  isWorkspaceOwner,
  canInviteMembers,
  canManageWorkspace,
  canTriggerSync,
  canViewAnalytics,
  getRoleDisplayName,
  getRoleBadgeColor,
  PERMISSIONS,
} from '@/lib/utils/permissions';
import type { User, WorkspaceMembership, GlobalRole, WorkspaceRole } from '@/types';

// Mock data factories
const createUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  email: 'user@example.com',
  name: 'Test User',
  role: 'user',
  ...overrides,
});

const createMembership = (overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership => ({
  id: 'member-123',
  workspaceId: 'workspace-123',
  userId: 'user-123',
  role: 'member',
  permissions: {
    canQuery: true,
    canViewSources: true,
    canInvite: false,
  },
  status: 'active',
  joinedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('Permissions Utilities', () => {
  // ===========================================================================
  // hasGlobalRole Tests
  // ===========================================================================
  describe('hasGlobalRole', () => {
    it('should return true if user has matching role', () => {
      const user = createUser({ role: 'admin' });
      expect(hasGlobalRole(user, ['admin'])).toBe(true);
    });

    it('should return true if user role is in the list', () => {
      const user = createUser({ role: 'user' });
      expect(hasGlobalRole(user, ['user', 'admin'])).toBe(true);
    });

    it('should return false if user role is not in the list', () => {
      const user = createUser({ role: 'user' });
      expect(hasGlobalRole(user, ['admin'])).toBe(false);
    });

    it('should return false if user is null', () => {
      expect(hasGlobalRole(null, ['admin'])).toBe(false);
    });
  });

  // ===========================================================================
  // isAdmin Tests
  // ===========================================================================
  describe('isAdmin', () => {
    it('should return true for admin user', () => {
      const user = createUser({ role: 'admin' });
      expect(isAdmin(user)).toBe(true);
    });

    it('should return false for regular user', () => {
      const user = createUser({ role: 'user' });
      expect(isAdmin(user)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isAdmin(null)).toBe(false);
    });
  });

  // ===========================================================================
  // hasWorkspaceRole Tests
  // ===========================================================================
  describe('hasWorkspaceRole', () => {
    it('should return true if membership has matching role', () => {
      const membership = createMembership({ role: 'owner' });
      expect(hasWorkspaceRole(membership, ['owner'])).toBe(true);
    });

    it('should return true if membership role is in the list', () => {
      const membership = createMembership({ role: 'member' });
      expect(hasWorkspaceRole(membership, ['owner', 'member'])).toBe(true);
    });

    it('should return false if membership role is not in the list', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(hasWorkspaceRole(membership, ['owner', 'member'])).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(hasWorkspaceRole(null, ['owner'])).toBe(false);
    });
  });

  // ===========================================================================
  // hasPermission Tests
  // ===========================================================================
  describe('hasPermission', () => {
    it('should return true if permission is granted', () => {
      const membership = createMembership({
        permissions: { canQuery: true, canViewSources: true, canInvite: true },
      });
      expect(hasPermission(membership, 'canQuery')).toBe(true);
      expect(hasPermission(membership, 'canViewSources')).toBe(true);
      expect(hasPermission(membership, 'canInvite')).toBe(true);
    });

    it('should return false if permission is not granted', () => {
      const membership = createMembership({
        permissions: { canQuery: false, canViewSources: false, canInvite: false },
      });
      expect(hasPermission(membership, 'canQuery')).toBe(false);
      expect(hasPermission(membership, 'canViewSources')).toBe(false);
      expect(hasPermission(membership, 'canInvite')).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(hasPermission(null, 'canQuery')).toBe(false);
    });
  });

  // ===========================================================================
  // isWorkspaceOwner Tests
  // ===========================================================================
  describe('isWorkspaceOwner', () => {
    it('should return true for owner role', () => {
      const membership = createMembership({ role: 'owner' });
      expect(isWorkspaceOwner(membership)).toBe(true);
    });

    it('should return false for member role', () => {
      const membership = createMembership({ role: 'member' });
      expect(isWorkspaceOwner(membership)).toBe(false);
    });

    it('should return false for viewer role', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(isWorkspaceOwner(membership)).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(isWorkspaceOwner(null)).toBe(false);
    });
  });

  // ===========================================================================
  // canInviteMembers Tests
  // ===========================================================================
  describe('canInviteMembers', () => {
    it('should return true for owner', () => {
      const membership = createMembership({ role: 'owner' });
      expect(canInviteMembers(membership)).toBe(true);
    });

    it('should return true if canInvite permission is granted', () => {
      const membership = createMembership({
        role: 'member',
        permissions: { canQuery: true, canViewSources: true, canInvite: true },
      });
      expect(canInviteMembers(membership)).toBe(true);
    });

    it('should return false for member without canInvite permission', () => {
      const membership = createMembership({
        role: 'member',
        permissions: { canQuery: true, canViewSources: true, canInvite: false },
      });
      expect(canInviteMembers(membership)).toBe(false);
    });

    it('should return false for viewer', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(canInviteMembers(membership)).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(canInviteMembers(null)).toBe(false);
    });
  });

  // ===========================================================================
  // canManageWorkspace Tests
  // ===========================================================================
  describe('canManageWorkspace', () => {
    it('should return true for owner', () => {
      const membership = createMembership({ role: 'owner' });
      expect(canManageWorkspace(membership)).toBe(true);
    });

    it('should return false for member', () => {
      const membership = createMembership({ role: 'member' });
      expect(canManageWorkspace(membership)).toBe(false);
    });

    it('should return false for viewer', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(canManageWorkspace(membership)).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(canManageWorkspace(null)).toBe(false);
    });
  });

  // ===========================================================================
  // canTriggerSync Tests
  // ===========================================================================
  describe('canTriggerSync', () => {
    it('should return true for owner', () => {
      const membership = createMembership({ role: 'owner' });
      expect(canTriggerSync(membership)).toBe(true);
    });

    it('should return true for member', () => {
      const membership = createMembership({ role: 'member' });
      expect(canTriggerSync(membership)).toBe(true);
    });

    it('should return false for viewer', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(canTriggerSync(membership)).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(canTriggerSync(null)).toBe(false);
    });
  });

  // ===========================================================================
  // canViewAnalytics Tests
  // ===========================================================================
  describe('canViewAnalytics', () => {
    it('should return true for owner', () => {
      const membership = createMembership({ role: 'owner' });
      expect(canViewAnalytics(membership)).toBe(true);
    });

    it('should return true for member', () => {
      const membership = createMembership({ role: 'member' });
      expect(canViewAnalytics(membership)).toBe(true);
    });

    it('should return false for viewer', () => {
      const membership = createMembership({ role: 'viewer' });
      expect(canViewAnalytics(membership)).toBe(false);
    });

    it('should return false if membership is null', () => {
      expect(canViewAnalytics(null)).toBe(false);
    });
  });

  // ===========================================================================
  // getRoleDisplayName Tests
  // ===========================================================================
  describe('getRoleDisplayName', () => {
    it('should return "Owner" for owner role', () => {
      expect(getRoleDisplayName('owner')).toBe('Owner');
    });

    it('should return "Member" for member role', () => {
      expect(getRoleDisplayName('member')).toBe('Member');
    });

    it('should return "Viewer" for viewer role', () => {
      expect(getRoleDisplayName('viewer')).toBe('Viewer');
    });
  });

  // ===========================================================================
  // getRoleBadgeColor Tests
  // ===========================================================================
  describe('getRoleBadgeColor', () => {
    it('should return purple classes for owner', () => {
      const color = getRoleBadgeColor('owner');
      expect(color).toContain('purple');
    });

    it('should return blue classes for member', () => {
      const color = getRoleBadgeColor('member');
      expect(color).toContain('blue');
    });

    it('should return gray classes for viewer', () => {
      const color = getRoleBadgeColor('viewer');
      expect(color).toContain('gray');
    });
  });

  // ===========================================================================
  // PERMISSIONS Constants Tests
  // ===========================================================================
  describe('PERMISSIONS', () => {
    it('should have admin-only global permissions', () => {
      expect(PERMISSIONS.ADMIN_DASHBOARD).toContain('admin');
      expect(PERMISSIONS.MANAGE_ALL_WORKSPACES).toContain('admin');
      expect(PERMISSIONS.VIEW_SYSTEM_STATS).toContain('admin');
    });

    it('should have owner-only workspace permissions', () => {
      expect(PERMISSIONS.WORKSPACE_SETTINGS).toContain('owner');
      expect(PERMISSIONS.REVOKE_MEMBERS).toContain('owner');
      expect(PERMISSIONS.MANAGE_PERMISSIONS).toContain('owner');
    });

    it('should allow all roles to query', () => {
      expect(PERMISSIONS.QUERY).toContain('owner');
      expect(PERMISSIONS.QUERY).toContain('member');
      expect(PERMISSIONS.QUERY).toContain('viewer');
    });

    it('should only allow owner and member to trigger sync', () => {
      expect(PERMISSIONS.TRIGGER_SYNC).toContain('owner');
      expect(PERMISSIONS.TRIGGER_SYNC).toContain('member');
      expect(PERMISSIONS.TRIGGER_SYNC).not.toContain('viewer');
    });
  });
});

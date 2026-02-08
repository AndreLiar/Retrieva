'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import type { WorkspacePermissions } from '@/types';

interface PermissionState {
  // Global checks
  isAdmin: boolean;
  isAuthenticated: boolean;

  // Workspace role checks
  isWorkspaceOwner: boolean;
  isWorkspaceMember: boolean;
  isWorkspaceViewer: boolean;
  hasWorkspaceAccess: boolean;

  // Permission checks
  canQuery: boolean;
  canViewSources: boolean;
  canInvite: boolean;

  // Compound checks
  canManageWorkspace: boolean;
  canTriggerSync: boolean;
  canViewAnalytics: boolean;
  canManageMembers: boolean;
}

/**
 * Hook to check user permissions at both global and workspace levels
 */
export function usePermissions(): PermissionState {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeWorkspace = useActiveWorkspace();

  return useMemo(() => {
    const membership = activeWorkspace?.membership;
    const role = membership?.role;
    const permissions = membership?.permissions;

    // Owners have all permissions by default
    const isOwner = role === 'owner';
    const isMember = role === 'member';

    // Debug logging
    console.log('[usePermissions] Computing permissions:', {
      hasActiveWorkspace: !!activeWorkspace,
      workspaceId: activeWorkspace?.id,
      membership,
      role,
      isOwner,
      isMember,
      permissions,
    });

    return {
      // Global checks
      isAdmin: user?.role === 'admin',
      isAuthenticated,

      // Workspace role checks
      isWorkspaceOwner: isOwner,
      isWorkspaceMember: isMember,
      isWorkspaceViewer: role === 'viewer',
      hasWorkspaceAccess: !!membership && membership.status === 'active',

      // Permission checks - owners and members can query by default
      canQuery: isOwner || isMember || (permissions?.canQuery ?? false),
      canViewSources: isOwner || isMember || (permissions?.canViewSources ?? false),
      canInvite: isOwner || (permissions?.canInvite ?? false),

      // Compound checks
      canManageWorkspace: isOwner,
      canTriggerSync: isOwner || isMember,
      canViewAnalytics: isOwner || isMember,
      canManageMembers: isOwner,
    };
  }, [user, isAuthenticated, activeWorkspace]);
}

/**
 * Hook to check if user has any of the specified global roles
 */
export function useHasGlobalRole(...roles: Array<'user' | 'admin'>): boolean {
  const user = useAuthStore((state) => state.user);
  return user ? roles.includes(user.role) : false;
}

/**
 * Hook to check if user has any of the specified workspace roles
 */
export function useHasWorkspaceRole(...roles: Array<'owner' | 'member' | 'viewer'>): boolean {
  const activeWorkspace = useActiveWorkspace();
  const role = activeWorkspace?.membership?.role;
  return role ? roles.includes(role) : false;
}

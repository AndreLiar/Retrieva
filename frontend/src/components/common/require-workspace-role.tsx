'use client';

import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import type { WorkspaceRole } from '@/types';

interface RequireWorkspaceRoleProps {
  roles: WorkspaceRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component that renders children only if user has one of the specified workspace roles.
 * Used for hiding UI elements based on workspace membership role.
 */
export function RequireWorkspaceRole({
  roles,
  children,
  fallback = null,
}: RequireWorkspaceRoleProps) {
  const activeWorkspace = useActiveWorkspace();
  const membership = activeWorkspace?.membership;

  if (!membership || !roles.includes(membership.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Component that renders children only if user is a workspace owner.
 * Convenience wrapper around RequireWorkspaceRole.
 */
export function RequireWorkspaceOwner({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RequireWorkspaceRole roles={['owner']} fallback={fallback}>
      {children}
    </RequireWorkspaceRole>
  );
}

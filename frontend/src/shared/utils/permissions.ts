import type { User, WorkspaceMembership, WorkspaceRole, GlobalRole } from '@/types';

/**
 * Permission definitions for different actions
 */
export const PERMISSIONS = {
  // Global admin actions
  ADMIN_DASHBOARD: ['admin'] as GlobalRole[],
  MANAGE_ALL_WORKSPACES: ['admin'] as GlobalRole[],
  VIEW_SYSTEM_STATS: ['admin'] as GlobalRole[],

  // Workspace actions by role
  WORKSPACE_SETTINGS: ['owner'] as WorkspaceRole[],
  INVITE_MEMBERS: ['owner'] as WorkspaceRole[], // or canInvite permission
  REVOKE_MEMBERS: ['owner'] as WorkspaceRole[],
  MANAGE_PERMISSIONS: ['owner'] as WorkspaceRole[],

  // Content actions
  QUERY: ['owner', 'member', 'viewer'] as WorkspaceRole[], // controlled by canQuery
  VIEW_SOURCES: ['owner', 'member', 'viewer'] as WorkspaceRole[], // controlled by canViewSources
  TRIGGER_SYNC: ['owner', 'member'] as WorkspaceRole[],
  VIEW_ANALYTICS: ['owner', 'member'] as WorkspaceRole[],
} as const;

/**
 * Check if user has a specific global role
 */
export function hasGlobalRole(user: User | null, roles: GlobalRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

/**
 * Check if user is an admin
 */
export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

/**
 * Check if membership has one of the specified workspace roles
 */
export function hasWorkspaceRole(
  membership: WorkspaceMembership | null,
  roles: WorkspaceRole[]
): boolean {
  if (!membership) return false;
  return roles.includes(membership.role);
}

/**
 * Check if membership has a specific permission
 */
export function hasPermission(
  membership: WorkspaceMembership | null,
  permission: 'canQuery' | 'canViewSources' | 'canInvite'
): boolean {
  if (!membership) return false;
  return membership.permissions[permission] === true;
}

/**
 * Check if user is workspace owner
 */
export function isWorkspaceOwner(membership: WorkspaceMembership | null): boolean {
  return membership?.role === 'owner';
}

/**
 * Check if user can invite members (owner or has canInvite permission)
 */
export function canInviteMembers(membership: WorkspaceMembership | null): boolean {
  if (!membership) return false;
  return membership.role === 'owner' || membership.permissions.canInvite;
}

/**
 * Check if user can manage workspace settings (owner only)
 */
export function canManageWorkspace(membership: WorkspaceMembership | null): boolean {
  return membership?.role === 'owner';
}

/**
 * Check if user can trigger sync (owner or member)
 */
export function canTriggerSync(membership: WorkspaceMembership | null): boolean {
  if (!membership) return false;
  return ['owner', 'member'].includes(membership.role);
}

/**
 * Check if user can view analytics (owner or member)
 */
export function canViewAnalytics(membership: WorkspaceMembership | null): boolean {
  if (!membership) return false;
  return ['owner', 'member'].includes(membership.role);
}

/**
 * Get display text for workspace role
 */
export function getRoleDisplayName(role: WorkspaceRole): string {
  const roleNames: Record<WorkspaceRole, string> = {
    owner: 'Owner',
    member: 'Member',
    viewer: 'Viewer',
  };
  return roleNames[role];
}

/**
 * Get role badge color class
 */
export function getRoleBadgeColor(role: WorkspaceRole): string {
  const colors: Record<WorkspaceRole, string> = {
    owner: 'bg-primary/10 text-primary',
    member: 'bg-info/10 text-info',
    viewer: 'bg-muted text-muted-foreground',
  };
  return colors[role];
}

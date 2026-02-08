'use client';

import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Granular permissions stored in membership
type GranularPermission = 'canQuery' | 'canViewSources' | 'canInvite';
// Role-based compound permissions
type CompoundPermission = 'canTriggerSync' | 'canViewAnalytics' | 'canManageMembers';
type Permission = GranularPermission | CompoundPermission;

interface RequirePermissionProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component that renders children only if user has the specified permission.
 * Used for hiding UI elements based on granular workspace permissions.
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const activeWorkspace = useActiveWorkspace();
  const membership = activeWorkspace?.membership;
  const role = membership?.role;
  const permissions = membership?.permissions;

  // Owners always have all permissions
  const isOwner = role === 'owner';
  const isMember = role === 'member';

  // Check permission based on type
  let hasPermission = false;

  if (isOwner) {
    hasPermission = true;
  } else if (permission === 'canTriggerSync' || permission === 'canViewAnalytics') {
    // These are available to members and owners
    hasPermission = isMember;
  } else if (permission === 'canManageMembers') {
    // Only owners can manage members
    hasPermission = false;
  } else {
    // Granular permissions from membership
    hasPermission = permissions?.[permission as GranularPermission] === true;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Tooltip messages for each permission
const permissionTooltips: Record<Permission, string> = {
  canQuery: 'You need query permission to ask questions',
  canViewSources: 'You need permission to view source documents',
  canInvite: 'Only workspace owners can invite members',
  canTriggerSync: 'Members and owners can sync data sources',
  canViewAnalytics: 'Members and owners can view analytics',
  canManageMembers: 'Only workspace owners can manage members',
};

interface DisabledWithTooltipProps {
  permission: Permission;
  children: React.ReactElement;
  className?: string;
}

/**
 * Component that shows a disabled element with a tooltip explaining why.
 * Use this for the "hybrid" RBAC approach - showing disabled state for upgrade-path features.
 */
export function DisabledWithTooltip({
  permission,
  children,
  className,
}: DisabledWithTooltipProps) {
  const activeWorkspace = useActiveWorkspace();
  const membership = activeWorkspace?.membership;
  const role = membership?.role;
  const permissions = membership?.permissions;
  const isOwner = role === 'owner';
  const isMember = role === 'member';

  // Check permission based on type (same logic as RequirePermission)
  let hasPermission = false;

  if (isOwner) {
    hasPermission = true;
  } else if (permission === 'canTriggerSync' || permission === 'canViewAnalytics') {
    hasPermission = isMember;
  } else if (permission === 'canManageMembers') {
    hasPermission = false;
  } else {
    hasPermission = permissions?.[permission as GranularPermission] === true;
  }

  if (hasPermission) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-block', className)}>
            {/* Clone the child element and disable it */}
            <span className="pointer-events-none opacity-50">
              {children}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{permissionTooltips[permission]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

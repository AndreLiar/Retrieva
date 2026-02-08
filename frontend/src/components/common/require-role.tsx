'use client';

import { useAuthStore } from '@/lib/stores/auth-store';
import type { GlobalRole } from '@/types';

interface RequireRoleProps {
  roles: GlobalRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component that renders children only if user has one of the specified global roles.
 * Used for hiding UI elements based on user role (admin vs user).
 */
export function RequireRole({ roles, children, fallback = null }: RequireRoleProps) {
  const user = useAuthStore((state) => state.user);

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Component that renders children only if user is an admin.
 * Convenience wrapper around RequireRole.
 */
export function RequireAdmin({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RequireRole roles={['admin']} fallback={fallback}>
      {children}
    </RequireRole>
  );
}

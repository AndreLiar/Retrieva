'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';

// Auth-only paths where we skip API call if not authenticated
// (login, register, etc. - no need to verify session)
const authOnlyPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

// Check if path is an auth-only page (login, register, etc.)
function isAuthOnlyRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return authOnlyPaths.some(path => pathname.startsWith(path));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initialize = useAuthStore((state) => state.initialize);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);

  // Initialize auth on mount
  useEffect(() => {
    const isAuthOnly = isAuthOnlyRoute(pathname);

    if (isAuthOnly) {
      // On auth pages (login, register), just mark as initialized without API call
      setInitialized();
    } else {
      // On all other pages (including landing page), verify session and fetch user data
      // This ensures we have fresh user data and valid session
      initialize();
    }
  }, [pathname, initialize, setInitialized]);

  // Fetch workspaces when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchWorkspaces();
    }
  }, [isAuthenticated, fetchWorkspaces]);

  return <>{children}</>;
}

'use client';

import { useEffect } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/state/auth-store';
import type { User } from '@/types';

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
  authResolved?: boolean;
}

export function AuthProvider({
  children,
  initialUser,
  authResolved = false,
}: AuthProviderProps) {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setInitialized = useAuthStore((state) => state.setInitialized);

  useEffect(() => {
    if (authResolved) {
      setUser(initialUser ?? null);
      setLoading(false);
      setInitialized(true);
      return;
    }

    if (isInitialized) return;

    let cancelled = false;

    const initializeSession = async () => {
      setLoading(true);
      try {
        const response = await authApi.getMe();
        if (cancelled) return;

        if (response.status === 'success' && response.data) {
          setUser(response.data.user);
        } else {
          clearSession();
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    void initializeSession();

    return () => {
      cancelled = true;
    };
  }, [
    authResolved,
    initialUser,
    isInitialized,
    setUser,
    clearSession,
    setLoading,
    setInitialized,
  ]);

  // Proactive silent refresh: while authenticated, renew the 15-min access token
  // a couple of minutes before it expires so the session never breaks mid-use.
  // The httpOnly cookies are renewed server-side; on failure (e.g. refresh token
  // expired) the next request's 401 handler clears the session.
  useEffect(() => {
    if (!isAuthenticated) return;

    const REFRESH_INTERVAL_MS = 13 * 60 * 1000; // < 15-min access-token TTL

    const intervalId = setInterval(() => {
      void authApi.refreshToken().catch(() => {
        // Swallow: the axios 401 interceptor / AuthProvider handles real expiry.
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  return <>{children}</>;
}

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

  return <>{children}</>;
}

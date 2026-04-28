'use client';

import { authApi } from '@/lib/api';
import { useAuthStore } from '@/state/auth-store';

export function useAuthSession() {
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const syncCurrentUser = async () => {
    const response = await authApi.getMe();
    if (response.status === 'success' && response.data) {
      setUser(response.data.user);
      return response.data.user;
    }

    clearSession();
    return null;
  };

  return {
    syncCurrentUser,
  };
}

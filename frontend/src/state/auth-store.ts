import { create } from 'zustand';

import type { User } from '@/types';
import { AUTH_EVENT_CONFIG, validateLogoutEvent } from '@/shared/lib/auth-events';
import { clearActiveWorkspaceContextId } from '@/shared/lib/workspace-context';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  updateUser: (userData: Partial<User>) => void;
  clearSession: () => void;
  setLoading: (isLoading: boolean) => void;
  setInitialized: (initialized?: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
    });
  },

  updateUser: (userData) => {
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: { ...currentUser, ...userData },
      });
    }
  },

  clearSession: () => {
    clearActiveWorkspaceContextId();
    set({
      user: null,
      isAuthenticated: false,
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setInitialized: (initialized = true) => {
    set({ isInitialized: initialized });
  },
}));

export const useIsAdmin = (): boolean => {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'admin';
};

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_EVENT_CONFIG.eventName, ((event: CustomEvent<{ token?: string }>) => {
    if (!validateLogoutEvent(event)) {
      return;
    }

    useAuthStore.getState().clearSession();
  }) as EventListener);
}

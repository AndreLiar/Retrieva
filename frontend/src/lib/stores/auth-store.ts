import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, GlobalRole } from '@/types';
import { authApi } from '@/lib/api';
// ISSUE #40 FIX: Import secure auth event validation
import { AUTH_EVENT_CONFIG, validateLogoutEvent } from '@/lib/auth-events';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setUser: (user: User | null) => void;
  updateUser: (userData: Partial<User>) => void;
  setInitialized: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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

      setInitialized: () => {
        set({ isInitialized: true, isLoading: false });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login({ email, password });
          if (response.status === 'success' && response.data) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const response = await authApi.register({ email, password, name });
          if (response.status === 'success' && response.data) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async (all = false) => {
        try {
          await authApi.logout(all);
        } catch {
          // Continue with local logout even if API call fails
        } finally {
          set({
            user: null,
            isAuthenticated: false,
          });
          // Clear workspace data
          localStorage.removeItem('activeWorkspaceId');
        }
      },

      fetchUser: async () => {
        set({ isLoading: true });
        try {
          const response = await authApi.getMe();
          if (response.status === 'success' && response.data) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      initialize: async () => {
        console.log('[AuthStore] initialize called, isInitialized:', get().isInitialized);
        if (get().isInitialized) return;

        set({ isLoading: true });
        try {
          console.log('[AuthStore] Calling authApi.getMe()...');
          const response = await authApi.getMe();
          console.log('[AuthStore] getMe response:', response);
          if (response.status === 'success' && response.data) {
            console.log('[AuthStore] User authenticated:', response.data.user?.email);
            set({
              user: response.data.user,
              isAuthenticated: true,
            });
          }
        } catch (error) {
          console.error('[AuthStore] initialize error:', error);
          set({
            user: null,
            isAuthenticated: false,
          });
        } finally {
          console.log('[AuthStore] initialize complete, isAuthenticated:', get().isAuthenticated);
          set({
            isLoading: false,
            isInitialized: true,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // ISSUE #49 FIX: Persist user data for immediate display on page refresh
        // Actual auth is still validated via HTTP-only cookies on API calls
        // This prevents the UI from showing empty state while waiting for /auth/me
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);

// Helper hook to check if user is admin
export const useIsAdmin = (): boolean => {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'admin';
};

/**
 * ISSUE #40 FIX: Secure logout event listener
 *
 * Only processes logout events that include the correct security token.
 * This prevents malicious scripts from forcing user logout via
 * window.dispatchEvent(new CustomEvent('auth:logout')).
 */
if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_EVENT_CONFIG.eventName, ((event: CustomEvent<{ token?: string }>) => {
    // Validate the security token
    if (!validateLogoutEvent(event)) {
      console.warn('[Security] Blocked unauthorized logout event - invalid token');
      return;
    }

    // Token valid - proceed with logout
    useAuthStore.getState().setUser(null);
  }) as EventListener);
}

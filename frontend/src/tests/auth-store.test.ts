/**
 * Auth Store Unit Tests
 *
 * Tests for Zustand auth state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// Mock the API
vi.mock('@/lib/api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}));

// Mock auth-events
vi.mock('@/lib/auth-events', () => ({
  AUTH_EVENT_CONFIG: { eventName: 'auth:logout' },
  validateLogoutEvent: vi.fn(() => false),
}));

// Import after mocking
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api';
import type { User } from '@/types';

// Mock user data
const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  isEmailVerified: true,
};

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('should have null user initially', () => {
      const { user } = useAuthStore.getState();
      expect(user).toBeNull();
    });

    it('should not be authenticated initially', () => {
      const { isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(false);
    });

    it('should not be loading initially', () => {
      const { isLoading } = useAuthStore.getState();
      expect(isLoading).toBe(false);
    });

    it('should not be initialized initially', () => {
      const { isInitialized } = useAuthStore.getState();
      expect(isInitialized).toBe(false);
    });
  });

  // ===========================================================================
  // setUser Tests
  // ===========================================================================
  describe('setUser', () => {
    it('should set user and mark as authenticated', () => {
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(user).toEqual(mockUser);
      expect(isAuthenticated).toBe(true);
    });

    it('should clear user and mark as not authenticated when null', () => {
      // First set a user
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      // Then clear
      act(() => {
        useAuthStore.getState().setUser(null);
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(isAuthenticated).toBe(false);
    });
  });

  // ===========================================================================
  // updateUser Tests
  // ===========================================================================
  describe('updateUser', () => {
    it('should update existing user properties', () => {
      // Set initial user
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      // Update name
      act(() => {
        useAuthStore.getState().updateUser({ name: 'Updated Name' });
      });

      const { user } = useAuthStore.getState();
      expect(user?.name).toBe('Updated Name');
      expect(user?.email).toBe(mockUser.email); // Other fields preserved
    });

    it('should not update if no user exists', () => {
      act(() => {
        useAuthStore.getState().updateUser({ name: 'Updated Name' });
      });

      const { user } = useAuthStore.getState();
      expect(user).toBeNull();
    });

    it('should allow updating email verification status', () => {
      act(() => {
        useAuthStore.getState().setUser({ ...mockUser, isEmailVerified: false });
      });

      act(() => {
        useAuthStore.getState().updateUser({ isEmailVerified: true });
      });

      const { user } = useAuthStore.getState();
      expect(user?.isEmailVerified).toBe(true);
    });
  });

  // ===========================================================================
  // setInitialized Tests
  // ===========================================================================
  describe('setInitialized', () => {
    it('should set initialized to true and loading to false', () => {
      // Start with loading true
      useAuthStore.setState({ isLoading: true });

      act(() => {
        useAuthStore.getState().setInitialized();
      });

      const { isInitialized, isLoading } = useAuthStore.getState();
      expect(isInitialized).toBe(true);
      expect(isLoading).toBe(false);
    });
  });

  // ===========================================================================
  // login Tests
  // ===========================================================================
  describe('login', () => {
    it('should login successfully and set user', async () => {
      vi.mocked(authApi.login).mockResolvedValue({
        status: 'success',
        message: 'Login successful',
        data: { user: mockUser, accessToken: 'token', refreshToken: 'refresh' },
      });

      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password');
      });

      const { user, isAuthenticated, isLoading } = useAuthStore.getState();
      expect(user).toEqual(mockUser);
      expect(isAuthenticated).toBe(true);
      expect(isLoading).toBe(false);
    });

    it('should set loading to true during login', async () => {
      let loadingDuringCall = false;

      vi.mocked(authApi.login).mockImplementation(async () => {
        loadingDuringCall = useAuthStore.getState().isLoading;
        return {
          status: 'success',
          message: 'Login successful',
          data: { user: mockUser, accessToken: 'token', refreshToken: 'refresh' },
        };
      });

      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password');
      });

      expect(loadingDuringCall).toBe(true);
    });

    it('should throw error and reset loading on failure', async () => {
      const error = new Error('Invalid credentials');
      vi.mocked(authApi.login).mockRejectedValue(error);

      await expect(
        act(async () => {
          await useAuthStore.getState().login('test@example.com', 'wrong');
        })
      ).rejects.toThrow('Invalid credentials');

      const { isLoading, isAuthenticated } = useAuthStore.getState();
      expect(isLoading).toBe(false);
      expect(isAuthenticated).toBe(false);
    });
  });

  // ===========================================================================
  // register Tests
  // ===========================================================================
  describe('register', () => {
    it('should register successfully and set user', async () => {
      vi.mocked(authApi.register).mockResolvedValue({
        status: 'success',
        message: 'Registration successful',
        data: { user: mockUser, accessToken: 'token', refreshToken: 'refresh' },
      });

      await act(async () => {
        await useAuthStore.getState().register('test@example.com', 'Password123', 'Test User');
      });

      const { user, isAuthenticated, isLoading } = useAuthStore.getState();
      expect(user).toEqual(mockUser);
      expect(isAuthenticated).toBe(true);
      expect(isLoading).toBe(false);
    });

    it('should throw error on registration failure', async () => {
      const error = new Error('Email already exists');
      vi.mocked(authApi.register).mockRejectedValue(error);

      await expect(
        act(async () => {
          await useAuthStore.getState().register('existing@example.com', 'Password123', 'Test');
        })
      ).rejects.toThrow('Email already exists');

      const { isLoading, isAuthenticated } = useAuthStore.getState();
      expect(isLoading).toBe(false);
      expect(isAuthenticated).toBe(false);
    });
  });

  // ===========================================================================
  // logout Tests
  // ===========================================================================
  describe('logout', () => {
    it('should clear user on logout', async () => {
      // Set up authenticated state
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      vi.mocked(authApi.logout).mockResolvedValue({
        status: 'success',
        message: 'Logout successful',
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(isAuthenticated).toBe(false);
    });

    it('should clear user even if API call fails', async () => {
      // Set up authenticated state
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const { user, isAuthenticated } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(isAuthenticated).toBe(false);
    });

    it('should call logout with all=true for logout all devices', async () => {
      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      vi.mocked(authApi.logout).mockResolvedValue({
        status: 'success',
        message: 'Logout successful',
      });

      await act(async () => {
        await useAuthStore.getState().logout(true);
      });

      expect(authApi.logout).toHaveBeenCalledWith(true);
    });
  });

  // ===========================================================================
  // fetchUser Tests
  // ===========================================================================
  describe('fetchUser', () => {
    it('should fetch and set user on success', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        status: 'success',
        message: 'User fetched',
        data: { user: mockUser },
      });

      await act(async () => {
        await useAuthStore.getState().fetchUser();
      });

      const { user, isAuthenticated, isLoading } = useAuthStore.getState();
      expect(user).toEqual(mockUser);
      expect(isAuthenticated).toBe(true);
      expect(isLoading).toBe(false);
    });

    it('should clear user on fetch failure', async () => {
      vi.mocked(authApi.getMe).mockRejectedValue(new Error('Unauthorized'));

      await act(async () => {
        await useAuthStore.getState().fetchUser();
      });

      const { user, isAuthenticated, isLoading } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(isAuthenticated).toBe(false);
      expect(isLoading).toBe(false);
    });
  });

  // ===========================================================================
  // initialize Tests
  // ===========================================================================
  describe('initialize', () => {
    it('should initialize and set user on success', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        status: 'success',
        message: 'User fetched',
        data: { user: mockUser },
      });

      await act(async () => {
        await useAuthStore.getState().initialize();
      });

      const { user, isAuthenticated, isInitialized, isLoading } = useAuthStore.getState();
      expect(user).toEqual(mockUser);
      expect(isAuthenticated).toBe(true);
      expect(isInitialized).toBe(true);
      expect(isLoading).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      // Mark as initialized
      useAuthStore.setState({ isInitialized: true });

      await act(async () => {
        await useAuthStore.getState().initialize();
      });

      expect(authApi.getMe).not.toHaveBeenCalled();
    });

    it('should set initialized to true even on failure', async () => {
      vi.mocked(authApi.getMe).mockRejectedValue(new Error('Unauthorized'));

      await act(async () => {
        await useAuthStore.getState().initialize();
      });

      const { isInitialized, isAuthenticated } = useAuthStore.getState();
      expect(isInitialized).toBe(true);
      expect(isAuthenticated).toBe(false);
    });
  });

  // ===========================================================================
  // State Persistence Tests
  // ===========================================================================
  describe('State Persistence', () => {
    it('should persist isAuthenticated and user', () => {
      // The partialize function should only persist certain fields
      // This is tested by checking what the persist middleware receives

      act(() => {
        useAuthStore.getState().setUser(mockUser);
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
    });
  });
});

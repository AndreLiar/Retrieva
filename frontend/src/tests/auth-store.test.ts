import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

import { useAuthStore } from '@/lib/stores/auth-store';

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
    });
  });

  it('starts with an empty auth shell', () => {
    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.isInitialized).toBe(false);
  });

  it('setUser sets the user and auth flag', () => {
    act(() => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isEmailVerified: true,
      });
    });

    const state = useAuthStore.getState();
    expect(state.user?.email).toBe('test@example.com');
    expect(state.isAuthenticated).toBe(true);
  });

  it('updateUser only patches an existing user', () => {
    act(() => {
      useAuthStore.getState().updateUser({ name: 'Ignored' });
    });
    expect(useAuthStore.getState().user).toBeNull();

    act(() => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isEmailVerified: false,
      });
      useAuthStore.getState().updateUser({
        name: 'Updated User',
        isEmailVerified: true,
      });
    });

    const user = useAuthStore.getState().user;
    expect(user?.name).toBe('Updated User');
    expect(user?.isEmailVerified).toBe(true);
    expect(user?.email).toBe('test@example.com');
  });

  it('clearSession clears auth state', () => {
    act(() => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isEmailVerified: true,
      });
      useAuthStore.getState().clearSession();
    });

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('tracks loading and initialization flags explicitly', () => {
    act(() => {
      useAuthStore.getState().setLoading(true);
      useAuthStore.getState().setInitialized();
    });

    expect(useAuthStore.getState().isLoading).toBe(true);
    expect(useAuthStore.getState().isInitialized).toBe(true);

    act(() => {
      useAuthStore.getState().setLoading(false);
      useAuthStore.getState().setInitialized(false);
    });

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isInitialized).toBe(false);
  });
});

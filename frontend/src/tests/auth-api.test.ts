/**
 * Frontend Tests — authApi client
 *
 * All tests mock the Axios client so no real HTTP requests are made.
 * Covers all 12 methods: login, register, logout, refreshToken, getMe,
 * forgotPassword, resetPassword, verifyEmail, resendVerification,
 * changePassword, updateProfile, updateOnboarding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing authApi
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
  },
}));

import { authApi } from '@/lib/api/auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  _id: 'user-001',
  name: 'Alice Dupont',
  email: 'alice@example.com',
  role: 'user',
  emailVerified: true,
};

const mockAuthResponse = {
  user: mockUser,
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login()', () => {
    it('calls POST /auth/login with credentials', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: mockAuthResponse } });
      await authApi.login({ email: 'alice@example.com', password: 'secret' });
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'alice@example.com',
        password: 'secret',
      });
    });

    it('returns response data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: mockAuthResponse } });
      const result = await authApi.login({ email: 'alice@example.com', password: 'secret' });
      expect(result.data.user.email).toBe('alice@example.com');
      expect(result.data.accessToken).toBe('access-token-abc');
    });
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------
  describe('register()', () => {
    it('calls POST /auth/register with registration data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: mockAuthResponse } });
      const data = { name: 'Alice', email: 'alice@example.com', password: 'secret123' };
      await authApi.register(data);
      expect(mockPost).toHaveBeenCalledWith('/auth/register', data);
    });

    it('returns the new user auth response', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success', data: mockAuthResponse } });
      const result = await authApi.register({ name: 'Alice', email: 'alice@example.com', password: 'pw' });
      expect(result.data.user.name).toBe('Alice Dupont');
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout()', () => {
    it('calls POST /auth/logout without query param by default', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await authApi.logout();
      expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    });

    it('calls POST /auth/logout?all=true when all=true', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await authApi.logout(true);
      expect(mockPost).toHaveBeenCalledWith('/auth/logout?all=true');
    });

    it('returns response data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      const result = await authApi.logout();
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken
  // -------------------------------------------------------------------------
  describe('refreshToken()', () => {
    it('calls POST /auth/refresh', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
      });
      await authApi.refreshToken();
      expect(mockPost).toHaveBeenCalledWith('/auth/refresh');
    });

    it('returns new tokens', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
      });
      const result = await authApi.refreshToken();
      expect(result.data.accessToken).toBe('new-access');
      expect(result.data.refreshToken).toBe('new-refresh');
    });
  });

  // -------------------------------------------------------------------------
  // getMe
  // -------------------------------------------------------------------------
  describe('getMe()', () => {
    it('calls GET /auth/me', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { user: mockUser } } });
      await authApi.getMe();
      expect(mockGet).toHaveBeenCalledWith('/auth/me');
    });

    it('returns the current user', async () => {
      mockGet.mockResolvedValue({ data: { status: 'success', data: { user: mockUser } } });
      const result = await authApi.getMe();
      expect(result.data.user._id).toBe('user-001');
    });
  });

  // -------------------------------------------------------------------------
  // forgotPassword
  // -------------------------------------------------------------------------
  describe('forgotPassword()', () => {
    it('calls POST /auth/forgot-password with email', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await authApi.forgotPassword({ email: 'alice@example.com' });
      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', { email: 'alice@example.com' });
    });

    it('returns success response', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      const result = await authApi.forgotPassword({ email: 'alice@example.com' });
      expect(result.status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // resetPassword
  // -------------------------------------------------------------------------
  describe('resetPassword()', () => {
    it('calls POST /auth/reset-password with token and new password', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      const data = { token: 'reset-tok', password: 'newpw123', confirmPassword: 'newpw123' };
      await authApi.resetPassword(data);
      expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', data);
    });
  });

  // -------------------------------------------------------------------------
  // verifyEmail
  // -------------------------------------------------------------------------
  describe('verifyEmail()', () => {
    it('calls POST /auth/verify-email with token in body', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await authApi.verifyEmail('verify-token-abc');
      expect(mockPost).toHaveBeenCalledWith('/auth/verify-email', { token: 'verify-token-abc' });
    });
  });

  // -------------------------------------------------------------------------
  // resendVerification
  // -------------------------------------------------------------------------
  describe('resendVerification()', () => {
    it('calls POST /auth/resend-verification without body', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      await authApi.resendVerification();
      expect(mockPost).toHaveBeenCalledWith('/auth/resend-verification');
    });
  });

  // -------------------------------------------------------------------------
  // changePassword
  // -------------------------------------------------------------------------
  describe('changePassword()', () => {
    it('calls POST /auth/change-password with password data', async () => {
      mockPost.mockResolvedValue({ data: { status: 'success' } });
      const data = { currentPassword: 'old', newPassword: 'new123', confirmPassword: 'new123' };
      await authApi.changePassword(data);
      expect(mockPost).toHaveBeenCalledWith('/auth/change-password', data);
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------
  describe('updateProfile()', () => {
    it('calls PATCH /auth/profile with updated fields', async () => {
      mockPatch.mockResolvedValue({ data: { status: 'success', data: { user: mockUser } } });
      await authApi.updateProfile({ name: 'Alice Updated' });
      expect(mockPatch).toHaveBeenCalledWith('/auth/profile', { name: 'Alice Updated' });
    });

    it('returns updated user', async () => {
      mockPatch.mockResolvedValue({ data: { status: 'success', data: { user: mockUser } } });
      const result = await authApi.updateProfile({ email: 'new@example.com' });
      expect(result.data.user).toEqual(mockUser);
    });
  });

  // -------------------------------------------------------------------------
  // updateOnboarding
  // -------------------------------------------------------------------------
  describe('updateOnboarding()', () => {
    it('calls PATCH /auth/onboarding with completed flag', async () => {
      mockPatch.mockResolvedValue({ data: { status: 'success' } });
      await authApi.updateOnboarding({ completed: true });
      expect(mockPatch).toHaveBeenCalledWith('/auth/onboarding', { completed: true });
    });

    it('calls PATCH /auth/onboarding with partial checklist', async () => {
      mockPatch.mockResolvedValue({ data: { status: 'success' } });
      await authApi.updateOnboarding({ checklist: { vendorCreated: true, assessmentCreated: false } });
      expect(mockPatch).toHaveBeenCalledWith('/auth/onboarding', {
        checklist: { vendorCreated: true, assessmentCreated: false },
      });
    });

    it('returns success response', async () => {
      mockPatch.mockResolvedValue({ data: { status: 'success' } });
      const result = await authApi.updateOnboarding({ completed: true });
      expect(result.status).toBe('success');
    });
  });
});

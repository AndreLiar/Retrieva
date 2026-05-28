import apiClient from '@/shared/api/client';
import type {
  ApiResponse,
  AuthResponse,
  User,
  LoginCredentials,
  RegisterData,
  ForgotPasswordData,
  ResetPasswordData,
  ChangePasswordData,
  MfaSetupResponse,
  MfaEnableResponse,
} from '@/types';

export const authApi = {
  /**
   * Login with email and password.
   * When the account has MFA enabled, the response carries
   * `{ mfaRequired: true, mfaToken }` instead of a session — call `verifyMfa`.
   */
  login: async (credentials: LoginCredentials) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/login',
      credentials
    );
    return response.data;
  },

  /**
   * Step 2 of MFA login: exchange the challenge token + a TOTP or recovery code
   * for a session.
   */
  verifyMfa: async (mfaToken: string, code: string) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/mfa/verify', {
      mfaToken,
      code,
    });
    return response.data;
  },

  /**
   * Start MFA enrollment — returns the TOTP secret + otpauth URI (not yet enabled).
   */
  setupMfa: async () => {
    const response = await apiClient.post<ApiResponse<MfaSetupResponse>>('/auth/mfa/setup');
    return response.data;
  },

  /**
   * Finish MFA enrollment — verify the first code, enable MFA, return recovery codes.
   */
  enableMfa: async (token: string) => {
    const response = await apiClient.post<ApiResponse<MfaEnableResponse>>('/auth/mfa/enable', {
      token,
    });
    return response.data;
  },

  /**
   * Disable MFA — requires the current password and a valid TOTP/recovery code.
   */
  disableMfa: async (password: string, code: string) => {
    const response = await apiClient.post<ApiResponse>('/auth/mfa/disable', {
      password,
      code,
    });
    return response.data;
  },

  /**
   * Register a new user
   */
  register: async (data: RegisterData) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/register',
      data
    );
    return response.data;
  },

  /**
   * Logout current session
   * @param all - If true, logout from all devices
   */
  logout: async (all = false) => {
    const response = await apiClient.post<ApiResponse>(
      `/auth/logout${all ? '?all=true' : ''}`
    );
    return response.data;
  },

  /**
   * Refresh access token
   */
  refreshToken: async () => {
    const response = await apiClient.post<
      ApiResponse<{ accessToken: string; refreshToken: string }>
    >('/auth/refresh');
    return response.data;
  },

  /**
   * Get current user profile
   */
  getMe: async () => {
    const response = await apiClient.get<ApiResponse<{ user: User }>>(
      '/auth/me'
    );
    return response.data;
  },

  /**
   * Request password reset email
   */
  forgotPassword: async (data: ForgotPasswordData) => {
    const response = await apiClient.post<ApiResponse>(
      '/auth/forgot-password',
      data
    );
    return response.data;
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: ResetPasswordData) => {
    const response = await apiClient.post<ApiResponse>(
      '/auth/reset-password',
      data
    );
    return response.data;
  },

  /**
   * Verify email with token
   */
  verifyEmail: async (token: string) => {
    const response = await apiClient.post<ApiResponse>('/auth/verify-email', {
      token,
    });
    return response.data;
  },

  /**
   * Resend verification email
   */
  resendVerification: async () => {
    const response = await apiClient.post<ApiResponse>(
      '/auth/resend-verification'
    );
    return response.data;
  },

  /**
   * Change password (requires current password)
   */
  changePassword: async (data: ChangePasswordData) => {
    const response = await apiClient.post<ApiResponse>(
      '/auth/change-password',
      data
    );
    return response.data;
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: { name?: string; email?: string }) => {
    const response = await apiClient.patch<ApiResponse<{ user: User }>>(
      '/auth/profile',
      data
    );
    return response.data;
  },

  /**
   * Update onboarding state (welcome screen + checklist flags)
   */
  updateOnboarding: async (data: {
    completed?: boolean;
    checklist?: Partial<{
      vendorCreated: boolean;
      assessmentCreated: boolean;
      memberInvited: boolean;
      monitoringSetup: boolean;
      dismissed: boolean;
    }>;
  }) => {
    const response = await apiClient.patch<ApiResponse>('/auth/onboarding', data);
    return response.data;
  },
};

import { authService } from '../services/AuthService.js';
import { catchAsync, sendSuccess } from '../utils/index.js';
import { setAuthCookies, clearAuthCookies, getRefreshToken } from '../utils/security/cookieConfig.js';
import logger from '../config/logger.js';

const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${userAgent.substring(0, 50)}|${ip}`;
};

/**
 * POST /api/v1/auth/register
 */
export const register = catchAsync(async (req, res) => {
  const { email, password, name, role, inviteToken } = req.body;

  const { user, needsOrganization, tokens } = await authService.register({
    email,
    password,
    name,
    role,
    inviteToken,
    deviceInfo: getDeviceInfo(req),
  });

  setAuthCookies(res, tokens);

  sendSuccess(
    res,
    201,
    'User registered successfully. Please check your email to verify your account.',
    {
      user,
      needsOrganization,
      ...tokens,
    }
  );
});

/**
 * POST /api/v1/auth/login
 */
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const { user, tokens } = await authService.login({
    email,
    password,
    deviceInfo: getDeviceInfo(req),
  });

  setAuthCookies(res, tokens);

  sendSuccess(res, 200, 'Login successful', {
    user,
    ...tokens,
  });
});

/**
 * POST /api/v1/auth/refresh
 *
 * SECURITY: Implements refresh token rotation. On any rejection, also clears
 * the HTTP-only auth cookies so the client retreats to a clean state.
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens({
      refreshTokenValue: getRefreshToken(req),
      deviceInfo: getDeviceInfo(req),
    });

    setAuthCookies(res, { accessToken, refreshToken: newRefreshToken });

    sendSuccess(res, 200, 'Token refreshed', {
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    // Any refresh failure must also clear cookies so the client doesn't keep
    // retrying with a now-stale cookie.
    clearAuthCookies(res);
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 * ?all=true logs out from all devices.
 */
export const logout = async (req, res, next) => {
  try {
    await authService.logout({
      userId: req.user?.userId,
      refreshTokenValue: getRefreshToken(req),
      logoutAll: req.query.all === 'true',
    });
  } catch (err) {
    logger.error('Logout failed', {
      error: err.message,
      userId: req.user?.userId,
    });
    // fall through — we still want to clear cookies and respond
  }

  clearAuthCookies(res);
  sendSuccess(res, 200, req.query.all === 'true' ? 'Logged out from all devices' : 'Logout successful');
  if (typeof next === 'function') return;
};

/**
 * GET /api/v1/auth/me
 */
export const getMe = catchAsync(async (req, res) => {
  const { user } = await authService.getMe(req.user.userId);
  sendSuccess(res, 200, 'User profile retrieved', { user });
});

/**
 * PATCH /api/v1/auth/profile
 */
export const updateProfile = catchAsync(async (req, res) => {
  const { user } = await authService.updateProfile(req.user.userId, req.body);
  sendSuccess(res, 200, 'Profile updated successfully', { user });
});

/**
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword({ email: req.body.email });
  sendSuccess(
    res,
    200,
    'If an account with that email exists, a password reset link has been sent.'
  );
});

/**
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body);
  sendSuccess(
    res,
    200,
    'Password has been reset successfully. Please login with your new password.'
  );
});

/**
 * POST /api/v1/auth/verify-email
 */
export const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail({ token: req.body.token });
  sendSuccess(res, 200, 'Email verified successfully.');
});

/**
 * POST /api/v1/auth/resend-verification
 */
export const resendVerification = catchAsync(async (req, res) => {
  await authService.resendVerification(req.user.userId);
  sendSuccess(res, 200, 'Verification email sent. Please check your inbox.');
});

/**
 * POST /api/v1/auth/change-password
 * SECURITY: Invalidates ALL refresh tokens after password change.
 */
export const changePassword = catchAsync(async (req, res) => {
  await authService.changePassword(req.user.userId, req.body);
  clearAuthCookies(res);
  sendSuccess(
    res,
    200,
    'Password changed successfully. Please login again with your new password.'
  );
});

/**
 * PATCH /api/v1/auth/onboarding
 */
export const updateOnboarding = catchAsync(async (req, res) => {
  await authService.updateOnboarding(req.user.userId, req.body);
  sendSuccess(res, 200, 'Onboarding state updated');
});

import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
  updateOnboarding,
  verifyMfa,
  setupMfa,
  enableMfa,
  disableMfa,
} from '../controllers/authController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  emailVerifyLimiter,
  resendVerifyLimiter,
  refreshLimiter,
} from '../middleware/authRateLimiter.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema,
  changePasswordSchema,
  updateOnboardingSchema,
  mfaVerifySchema,
  mfaEnableSchema,
  mfaDisableSchema,
} from '../validators/schemas.js';

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (sends verification email)
 * @access  Public
 */
router.post('/register', registerLimiter, validateBody(registerSchema), register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', loginLimiter, validateBody(loginSchema), login);

/**
 * @route   POST /api/v1/auth/mfa/verify
 * @desc    Step 2 of MFA login — exchange the challenge token + code for a session
 * @access  Public (requires a valid short-lived MFA challenge token)
 */
router.post('/mfa/verify', loginLimiter, validateBody(mfaVerifySchema), verifyMfa);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token (with token rotation)
 * @access  Public
 */
router.post('/refresh', refreshLimiter, validateBody(refreshTokenSchema), refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @query   all=true - Logout from all devices
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, getMe);

/**
 * @route   PATCH /api/v1/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.patch('/profile', authenticate, validateBody(updateProfileSchema), updateProfile);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token from email
 * @access  Public
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  resetPassword
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address with token
 * @access  Public
 */
router.post('/verify-email', emailVerifyLimiter, validateBody(verifyEmailSchema), verifyEmail);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Private
 */
router.post('/resend-verification', resendVerifyLimiter, authenticate, resendVerification);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password (invalidates all sessions)
 * @access  Private
 */
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

/**
 * @route   POST /api/v1/auth/mfa/setup | /mfa/enable | /mfa/disable
 * @desc    TOTP enrollment (setup → enable) and teardown (disable)
 * @access  Private
 */
router.post('/mfa/setup', authenticate, setupMfa);
router.post('/mfa/enable', authenticate, validateBody(mfaEnableSchema), enableMfa);
router.post('/mfa/disable', authenticate, validateBody(mfaDisableSchema), disableMfa);

/**
 * @route   PATCH /api/v1/auth/onboarding
 * @desc    Update onboarding state (welcome screen dismissed, checklist flags)
 * @access  Private
 */
router.patch('/onboarding', authenticate, validateBody(updateOnboardingSchema), updateOnboarding);

export default router;

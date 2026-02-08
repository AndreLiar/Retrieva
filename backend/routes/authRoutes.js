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
} from '../controllers/authController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../validators/schemas.js';

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (sends verification email)
 * @access  Public
 */
router.post('/register', validateBody(registerSchema), register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateBody(loginSchema), login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token (with token rotation)
 * @access  Public
 */
router.post('/refresh', validateBody(refreshTokenSchema), refreshToken);

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
router.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token from email
 * @access  Public
 */
router.post('/reset-password', validateBody(resetPasswordSchema), resetPassword);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address with token
 * @access  Public
 */
router.post('/verify-email', validateBody(verifyEmailSchema), verifyEmail);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification
 * @access  Private
 */
router.post('/resend-verification', authenticate, resendVerification);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password (invalidates all sessions)
 * @access  Private
 */
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

export default router;

import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import {
  generateTokenPair,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/security/jwt.js';
import { sha256 } from '../utils/security/crypto.js';
import { safeDecrypt } from '../utils/security/fieldEncryption.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshToken,
} from '../utils/security/cookieConfig.js';
import { emailService } from '../services/emailService.js';
import logger from '../config/logger.js';

const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;

/**
 * Get device info from request for token tracking
 */
const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${userAgent.substring(0, 50)}|${ip}`;
};

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
export const register = async (req, res) => {
  try {
    const { email, password, name, role, inviteToken } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn('Registration attempt with existing email', { email });
      return sendError(res, 409, 'Email already registered');
    }

    // Create new user
    const user = new User({
      email,
      password, // Will be hashed by pre-save hook
      name,
      role: role || 'user', // Default to 'user' if not provided
    });

    await user.save();

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    // Hash and save refresh token
    const tokenHash = hashRefreshToken(tokens.refreshToken);
    const deviceInfo = getDeviceInfo(req);
    await user.addRefreshToken(tokenHash, deviceInfo);

    // Process org invite token if provided
    let organizationId = null;
    if (inviteToken) {
      try {
        const member = await OrganizationMember.findByToken(inviteToken);
        if (member && member.email === email.toLowerCase()) {
          await OrganizationMember.activate(member._id, user._id);
          await User.findByIdAndUpdate(user._id, { organizationId: member.organizationId });
          organizationId = member.organizationId;
        }
      } catch (err) {
        logger.warn('Invite token processing failed during registration', {
          userId: user._id,
          error: err.message,
        });
      }
    }

    // Generate email verification token and send email
    const verificationToken = await user.createEmailVerificationToken();
    emailService
      .sendEmailVerification({
        toEmail: user.email,
        toName: name, // Use original name from request (user.name is encrypted after save)
        verificationToken,
      })
      .catch((err) => {
        logger.warn('Failed to send verification email', {
          userId: user._id,
          error: err.message,
        });
      });

    logger.info('New user registered', {
      userId: user._id,
      email: user.email,
      role: user.role,
      hasOrg: !!organizationId,
    });

    // Set HTTP-only cookies for secure token storage
    setAuthCookies(res, tokens);

    sendSuccess(
      res,
      201,
      'User registered successfully. Please check your email to verify your account.',
      {
        user: {
          id: user._id,
          email: user.email,
          name, // Use original name from request (user.name is encrypted after save)
          role: user.role,
          isEmailVerified: false,
          organizationId: organizationId ? organizationId.toString() : null,
        },
        needsOrganization: !organizationId,
        // Tokens also returned in body for API clients (mobile apps, etc.)
        ...tokens,
      }
    );
  } catch (error) {
    logger.error('Registration failed', {
      error: error.message,
      stack: error.stack,
    });
    // ISSUE #30 FIX: Use logger instead of console.error
    if (process.env.NODE_ENV === 'test') {
      logger.debug('Registration error details', {
        error: error.message,
        stack: error.stack,
      });
    }
    sendError(res, 500, 'Registration failed');
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password field
    const user = await User.findByCredentials(email);

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });
      return sendError(res, 401, 'Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.warn('Login attempt on locked account', {
        userId: user._id,
        lockUntil: user.lockUntil,
      });
      return sendError(res, 423, 'Account is temporarily locked. Please try again later.');
    }

    // Check if account is active
    if (!user.isActive) {
      logger.warn('Login attempt on inactive account', { userId: user._id });
      return sendError(res, 401, 'Account is inactive');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logger.warn('Failed login attempt', { email });
      await user.incLoginAttempts();
      return sendError(res, 401, 'Invalid credentials');
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    // Hash and save refresh token
    const tokenHash = hashRefreshToken(tokens.refreshToken);
    const deviceInfo = getDeviceInfo(req);
    await user.addRefreshToken(tokenHash, deviceInfo);

    logger.info('User logged in', {
      userId: user._id,
      email: user.email,
    });

    // Set HTTP-only cookies for secure token storage
    setAuthCookies(res, tokens);

    sendSuccess(res, 200, 'Login successful', {
      user: {
        id: user._id,
        email: user.email,
        name: safeDecrypt(user.name),
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      // Tokens also returned in body for API clients (mobile apps, etc.)
      ...tokens,
    });
  } catch (error) {
    logger.error('Login failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Login failed');
  }
};

/**
 * Refresh access token with token rotation
 * POST /api/v1/auth/refresh
 *
 * SECURITY: Implements refresh token rotation
 * - Old refresh token is consumed (invalidated)
 * - New refresh token is issued
 * - If old token is reused after rotation, all tokens are invalidated (theft detection)
 *
 * Accepts refresh token from:
 * 1. HTTP-only cookie (primary, secure)
 * 2. Request body (fallback for API clients)
 */
export const refreshToken = async (req, res) => {
  try {
    // Get refresh token from cookie or body
    const refreshTokenValue = getRefreshToken(req);

    if (!refreshTokenValue) {
      return sendError(res, 401, 'Refresh token required');
    }

    // Verify refresh token signature
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenValue);
    } catch (error) {
      logger.warn('Invalid refresh token signature', { error: error.message });
      clearAuthCookies(res);
      return sendError(res, 401, error.message || 'Invalid refresh token');
    }

    // Find user with refresh tokens
    const user = await User.findById(decoded.userId).select('+refreshTokens');

    if (!user) {
      logger.warn('User not found for refresh token', { userId: decoded.userId });
      clearAuthCookies(res);
      return sendError(res, 401, 'Invalid refresh token');
    }

    if (!user.isActive) {
      clearAuthCookies(res);
      return sendError(res, 401, 'Account is inactive');
    }

    // Hash the incoming token to compare with stored hashes
    const incomingTokenHash = hashRefreshToken(refreshTokenValue);

    // Consume the old token (rotation) - this removes it from valid tokens
    const tokenValid = await user.consumeRefreshToken(incomingTokenHash);

    if (!tokenValid) {
      // Token not found or expired - possible token reuse attack
      logger.warn('Refresh token not found or already used - possible token theft', {
        userId: user._id,
      });

      // Security: Clear all tokens on suspected theft
      await user.clearAllRefreshTokens();
      clearAuthCookies(res);

      return sendError(res, 401, 'Invalid refresh token. Please login again.');
    }

    // Generate new token pair (rotation)
    const newAccessToken = generateAccessToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = generateRefreshToken({
      userId: user._id,
      email: user.email,
    });

    // Store the new refresh token (hashed)
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const deviceInfo = getDeviceInfo(req);
    await user.addRefreshToken(newTokenHash, deviceInfo);

    // Set new cookies
    setAuthCookies(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    logger.info('Tokens rotated successfully', { userId: user._id });

    sendSuccess(res, 200, 'Token refreshed', {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error('Token refresh failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Token refresh failed');
  }
};

/**
 * Logout user (invalidate current refresh token and clear cookies)
 * POST /api/v1/auth/logout
 *
 * Query params:
 * - all=true: Logout from all devices (clear all refresh tokens)
 */
export const logout = async (req, res) => {
  try {
    const logoutAll = req.query.all === 'true';
    const user = await User.findById(req.user.userId).select('+refreshTokens');

    if (user) {
      if (logoutAll) {
        // Clear all refresh tokens (logout from all devices)
        await user.clearAllRefreshTokens();
        logger.info('User logged out from all devices', { userId: user._id });
      } else {
        // Clear only current session's token
        const currentRefreshToken = getRefreshToken(req);
        if (currentRefreshToken) {
          const tokenHash = hashRefreshToken(currentRefreshToken);
          await user.consumeRefreshToken(tokenHash);
        }
        logger.info('User logged out', { userId: user._id });
      }
    }

    // Clear HTTP-only cookies
    clearAuthCookies(res);

    sendSuccess(res, 200, logoutAll ? 'Logged out from all devices' : 'Logout successful');
  } catch (error) {
    logger.error('Logout failed', {
      error: error.message,
      userId: req.user?.userId,
    });
    // Still clear cookies even on error
    clearAuthCookies(res);
    sendError(res, 500, 'Logout failed');
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // Populate organization data if user belongs to one
    let organization = null;
    if (user.organizationId) {
      const org = await Organization.findById(user.organizationId).select('name industry country');
      if (org) {
        organization = {
          id: org._id,
          name: org.name,
          industry: org.industry,
          country: org.country,
        };
      }
    }

    sendSuccess(res, 200, 'User profile retrieved', {
      user: {
        id: user._id,
        email: user.email,
        name: safeDecrypt(user.name),
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        organizationId: user.organizationId ? user.organizationId.toString() : null,
        organization,
      },
    });
  } catch (error) {
    logger.error('Failed to get user profile', {
      error: error.message,
      userId: req.user?.userId,
    });
    sendError(res, 500, 'Failed to get user profile');
  }
};

/**
 * Update current user profile (name only)
 * PATCH /api/v1/auth/profile
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    const { name, email } = req.body;

    if (!name && !email) {
      return sendError(res, 400, 'No profile changes provided');
    }

    if (email && email !== user.email) {
      return sendError(res, 400, 'Email cannot be changed via profile update');
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    logger.info('User profile updated', { userId: user._id });

    // Manually decrypt name field if it's encrypted (after save hook encrypts it)
    const displayName = user.decryptField ? user.decryptField('name') : user.name;

    sendSuccess(res, 200, 'Profile updated successfully', {
      user: {
        id: user._id,
        email: user.email,
        name: displayName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    logger.error('Failed to update user profile', {
      error: error.message,
      userId: req.user?.userId,
    });
    sendError(res, 500, 'Failed to update profile');
  }
};

/**
 * Request password reset
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info('Password reset requested for non-existent email', { email });
      return sendSuccess(
        res,
        200,
        'If an account with that email exists, a password reset link has been sent.'
      );
    }

    // Generate reset token
    const resetToken = await user.createPasswordResetToken();

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail({
      toEmail: user.email,
      toName: user.name,
      resetToken,
    });

    if (!emailResult.success) {
      logger.error('Failed to send password reset email', {
        userId: user._id,
        error: emailResult.error || emailResult.reason,
        reason: emailResult.reason,
      });
      // Clear the token since email failed
      await user.clearPasswordResetToken();
      return sendError(
        res,
        503,
        'Email service is temporarily unavailable. Please try again later or contact support.'
      );
    }

    logger.info('Password reset email sent', { userId: user._id, email: user.email });

    sendSuccess(
      res,
      200,
      'If an account with that email exists, a password reset link has been sent.'
    );
  } catch (error) {
    logger.error('Forgot password failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Failed to process password reset request');
  }
};

/**
 * Reset password with token
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    // Hash the token to compare with stored hash
    const hashedToken = sha256(token);

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

    if (!user) {
      logger.warn('Invalid or expired password reset token');
      return sendError(res, 400, 'Invalid or expired reset token. Please request a new one.');
    }

    // Update password
    user.password = password;

    // Clear reset token
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    // Invalidate all refresh tokens (security: force re-login on all devices)
    user.refreshTokens = [];

    await user.save();

    logger.info('Password reset successful', { userId: user._id });

    sendSuccess(
      res,
      200,
      'Password has been reset successfully. Please login with your new password.'
    );
  } catch (error) {
    logger.error('Password reset failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Failed to reset password');
  }
};

/**
 * Verify email address
 * POST /api/v1/auth/verify-email
 */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    // Hash the token to compare with stored hash
    const hashedToken = sha256(token);

    // Find user with valid verification token
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      logger.warn('Invalid or expired email verification token');
      return sendError(
        res,
        400,
        'Invalid or expired verification token. Please request a new one.'
      );
    }

    // Capture name before save() re-encrypts it in memory
    const userName = user.name;

    // Mark email as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info('Email verified successfully', { userId: user._id, email: user.email });

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail({ toEmail: user.email, toName: userName }).catch((err) => {
      logger.warn('Failed to send welcome email after verification', {
        userId: user._id,
        error: err.message,
      });
    });

    sendSuccess(res, 200, 'Email verified successfully.');
  } catch (error) {
    logger.error('Email verification failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Failed to verify email');
  }
};

/**
 * Resend email verification
 * POST /api/v1/auth/resend-verification
 */
export const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (user.isEmailVerified) {
      return sendError(res, 400, 'Email is already verified');
    }

    if (user.emailVerificationLastSentAt) {
      const elapsedMs = Date.now() - user.emailVerificationLastSentAt.getTime();
      if (elapsedMs < RESEND_VERIFICATION_COOLDOWN_MS) {
        logger.warn('Resend verification blocked due to cooldown', {
          userId: user._id,
        });
        const waitSeconds = Math.ceil((RESEND_VERIFICATION_COOLDOWN_MS - elapsedMs) / 1000);
        return sendError(
          res,
          429,
          `Please wait ${waitSeconds}s before requesting another verification email.`
        );
      }
    }

    // Generate new verification token
    const verificationToken = await user.createEmailVerificationToken();

    // Send verification email
    const emailResult = await emailService.sendEmailVerification({
      toEmail: user.email,
      toName: user.name,
      verificationToken,
    });

    if (!emailResult.success) {
      logger.error('Failed to resend verification email', {
        userId: user._id,
        error: emailResult.error || emailResult.reason,
        reason: emailResult.reason,
      });
      return sendError(
        res,
        503,
        'Email service is temporarily unavailable. Please try again later or contact support.'
      );
    }

    logger.info('Verification email resent', { userId: user._id, email: user.email });

    sendSuccess(res, 200, 'Verification email sent. Please check your inbox.');
  } catch (error) {
    logger.error('Resend verification failed', {
      error: error.message,
      stack: error.stack,
    });
    sendError(res, 500, 'Failed to resend verification email');
  }
};

/**
 * Change password (with session invalidation)
 * POST /api/v1/auth/change-password
 *
 * SECURITY: Invalidates ALL refresh tokens after password change
 * This forces re-login on all devices
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password and refresh tokens
    const user = await User.findById(req.user.userId).select('+password +refreshTokens');

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      logger.warn('Change password failed - incorrect current password', {
        userId: user._id,
      });
      return sendError(res, 401, 'Current password is incorrect');
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;

    // SECURITY: Invalidate ALL refresh tokens (force re-login on all devices)
    user.refreshTokens = [];

    await user.save();

    // Clear current session cookies
    clearAuthCookies(res);

    logger.info('Password changed successfully - all sessions invalidated', {
      userId: user._id,
    });

    sendSuccess(
      res,
      200,
      'Password changed successfully. Please login again with your new password.'
    );
  } catch (error) {
    logger.error('Change password failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });
    sendError(res, 500, 'Failed to change password');
  }
};

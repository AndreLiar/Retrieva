import { AppError } from '../utils/index.js';
import { userRepository } from '../repositories/UserRepository.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import {
  generateTokenPair,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateMfaToken,
  verifyMfaToken,
} from '../utils/security/jwt.js';
import { sha256 } from '../utils/security/crypto.js';
import { safeDecrypt } from '../utils/security/fieldEncryption.js';
import { emailService } from './emailService.js';
import { authAuditService } from './authAuditService.js';
import { mfaService } from './mfaService.js';
import logger from '../config/logger.js';

const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;

function toUserPayload(user, overrides = {}) {
  return {
    id: user._id,
    email: user.email,
    name: safeDecrypt(user.name),
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: !!user.mfaEnabled,
    organizationId: user.organizationId ? user.organizationId.toString() : null,
    onboardingCompleted: user.onboardingCompleted,
    onboardingChecklist: user.onboardingChecklist,
    ...overrides,
  };
}

class AuthService {
  constructor(deps = {}) {
    this.userRepo = deps.userRepo || userRepository;
    this.organizationRepo = deps.organizationRepo || organizationRepository;
    this.memberRepo = deps.memberRepo || organizationMemberRepository;
    this.emailService = deps.emailService || emailService;
    this.authAudit = deps.authAudit || authAuditService;
    this.mfa = deps.mfa || mfaService;
    this.logger = deps.logger || logger;
  }

  /**
   * Resolve an organization summary for inclusion in /me + login responses.
   */
  async _resolveOrganizationSummary(organizationId) {
    if (!organizationId) return null;
    const org = await this.organizationRepo.findById(organizationId, {
      select: 'name industry country',
    });
    if (!org) return null;
    return {
      id: org._id,
      name: org.name,
      industry: org.industry,
      country: org.country,
    };
  }

  async register({ email, password, name, role, inviteToken, deviceInfo }) {
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      this.logger.warn('Registration attempt with existing email', { email });
      throw new AppError('Email already registered', 409);
    }

    // Hand-build the doc so pre-save hooks (password hash, name encrypt) run.
    const userDoc = new this.userRepo.model({
      email,
      password,
      name,
      role: role || 'user',
    });
    await userDoc.save();

    const tokens = generateTokenPair({
      userId: userDoc._id,
      email: userDoc.email,
      role: userDoc.role,
    });

    const tokenHash = hashRefreshToken(tokens.refreshToken);
    await userDoc.addRefreshToken(tokenHash, deviceInfo);

    let organizationId = null;
    if (inviteToken) {
      try {
        const member = await this.memberRepo.findByToken(inviteToken);
        if (member && member.email === email.toLowerCase()) {
          await this.memberRepo.activate(member._id, userDoc._id);
          await this.userRepo.updateById(userDoc._id, { organizationId: member.organizationId });
          organizationId = member.organizationId;
        }
      } catch (err) {
        this.logger.warn('Invite token processing failed during registration', {
          userId: userDoc._id,
          error: err.message,
        });
      }
    }

    const verificationToken = await userDoc.createEmailVerificationToken();
    this.emailService
      .sendEmailVerification({
        toEmail: userDoc.email,
        toName: name, // original from request (user.name is encrypted post-save)
        verificationToken,
      })
      .catch((err) => {
        this.logger.warn('Failed to send verification email', {
          userId: userDoc._id,
          error: err.message,
        });
      });

    this.logger.info('New user registered', {
      userId: userDoc._id,
      email: userDoc.email,
      role: userDoc.role,
      hasOrg: !!organizationId,
    });
    this.authAudit.logRegisterSuccess?.({ userId: userDoc._id, email: userDoc.email });

    return {
      user: {
        id: userDoc._id,
        email: userDoc.email,
        name,
        role: userDoc.role,
        isEmailVerified: false,
        organizationId: organizationId ? organizationId.toString() : null,
      },
      needsOrganization: !organizationId,
      tokens,
    };
  }

  /**
   * A3: notify a user out-of-band that all their sessions were revoked because
   * a refresh token was reused (a sign of theft). Best-effort and fully
   * defensive — never throws into, or blocks, the auth flow.
   */
  _sendTokenTheftAlert(user) {
    try {
      const result = this.emailService.sendEmail?.({
        to: user.email,
        subject: 'Security alert: we signed you out of all devices',
        html:
          `<p>Hi ${user.name || 'there'},</p>` +
          `<p>We detected that an old sign-in token for your Retrieva account was ` +
          `reused, which can indicate it was stolen. As a precaution we revoked ` +
          `all active sessions.</p>` +
          `<p><strong>If this was you</strong> (e.g. an old tab or device), just ` +
          `sign in again.</p>` +
          `<p><strong>If this wasn't you</strong>, reset your password immediately ` +
          `and review your account.</p><p>— The Retrieva team</p>`,
      });
      result?.catch?.((err) =>
        this.logger.warn('Failed to send token-theft alert email', {
          userId: user._id,
          error: err.message,
        })
      );
    } catch (err) {
      this.logger.warn('Failed to send token-theft alert email', {
        userId: user._id,
        error: err.message,
      });
    }
  }

  async login({ email, password, deviceInfo }) {
    const user = await this.userRepo.model.findByCredentials(email);

    if (!user) {
      this.logger.warn('Login attempt with non-existent email', { email });
      throw new AppError('Invalid credentials', 401);
    }

    if (user.isLocked) {
      this.logger.warn('Login attempt on locked account', {
        userId: user._id,
        lockUntil: user.lockUntil,
      });
      this.authAudit.logLoginBlockedLocked?.({ userId: user._id, email });
      throw new AppError('Account is temporarily locked. Please try again later.', 423);
    }

    if (!user.isActive) {
      this.logger.warn('Login attempt on inactive account', { userId: user._id });
      throw new AppError('Account is inactive', 401);
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      this.logger.warn('Failed login attempt', { email });
      await user.incLoginAttempts();
      this.authAudit.logLoginFailed?.({ userId: user._id, email });
      if (user.isLocked) {
        this.authAudit.logAccountLocked?.({ userId: user._id, email });
      }
      throw new AppError('Invalid credentials', 401);
    }

    await user.resetLoginAttempts();

    // A1: if MFA is enabled, password is only step 1. Return a short-lived
    // challenge instead of tokens; step 2 is POST /auth/mfa/verify.
    if (user.mfaEnabled) {
      this.logger.info('Login passed password, MFA required', { userId: user._id });
      this.authAudit.logLoginSuccess?.({ userId: user._id, email: user.email, mfa: 'pending' });
      return { mfaRequired: true, mfaToken: generateMfaToken({ userId: user._id }) };
    }

    return this._issueSession(user, deviceInfo);
  }

  /**
   * Issue tokens + a refresh session for an already-authenticated user, and
   * return the standard login payload. Shared by password login and MFA verify.
   */
  async _issueSession(user, deviceInfo) {
    const tokens = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    const tokenHash = hashRefreshToken(tokens.refreshToken);
    await user.addRefreshToken(tokenHash, deviceInfo);

    const organization = await this._resolveOrganizationSummary(user.organizationId);

    this.logger.info('User logged in', {
      userId: user._id,
      email: user.email,
    });
    this.authAudit.logLoginSuccess?.({ userId: user._id, email: user.email });

    return {
      user: toUserPayload(user, { organization }),
      tokens,
    };
  }

  // ---------------------------------------------------------------------------
  // MFA (TOTP) — audit gap A1
  // ---------------------------------------------------------------------------

  /**
   * Step 1 of enrollment: generate (but do not yet enable) a TOTP secret.
   * Returns the secret + otpauth URI for the authenticator app / QR.
   */
  async setupMfa(userId) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (user.mfaEnabled) throw new AppError('MFA is already enabled', 409);

    const secret = this.mfa.generateSecret();
    user.mfaSecret = secret;
    await user.save();

    return {
      secret,
      otpauthUrl: this.mfa.keyUri(user.email, secret),
    };
  }

  /**
   * Step 2 of enrollment: verify the first code, enable MFA, and return the
   * one-time recovery codes (shown to the user exactly once).
   */
  async enableMfa(userId, token) {
    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' });
    if (!user) throw new AppError('User not found', 404);
    if (user.mfaEnabled) throw new AppError('MFA is already enabled', 409);
    if (!user.mfaSecret) throw new AppError('Start MFA setup first', 400);

    if (!this.mfa.verifyTotp(user.mfaSecret, token)) {
      throw new AppError('Invalid verification code', 400);
    }

    const { plain, hashed } = this.mfa.generateRecoveryCodes();
    user.mfaEnabled = true;
    user.mfaRecoveryCodes = hashed;
    await user.save();

    this.logger.info('MFA enabled', { userId: user._id });
    return { recoveryCodes: plain };
  }

  /**
   * Step 2 of login: exchange a valid MFA challenge token + TOTP (or recovery)
   * code for a real session.
   */
  async verifyMfa({ mfaToken, code, deviceInfo }) {
    let decoded;
    try {
      decoded = verifyMfaToken(mfaToken);
    } catch (error) {
      throw new AppError(error.message || 'Invalid MFA token', 401);
    }

    const user = await this.userRepo.findById(decoded.userId, {
      select: '+mfaSecret +mfaRecoveryCodes',
    });
    if (!user || !user.mfaEnabled) {
      throw new AppError('MFA is not enabled for this account', 400);
    }
    if (!user.isActive) throw new AppError('Account is inactive', 401);

    if (!this._consumeMfaCode(user, code)) {
      this.authAudit.logLoginFailed?.({ userId: user._id, reason: 'mfa' });
      throw new AppError('Invalid verification code', 401);
    }

    // _consumeMfaCode may have spent a recovery code → persist before issuing.
    if (user.isModified?.('mfaRecoveryCodes')) await user.save();

    return this._issueSession(user, deviceInfo);
  }

  /**
   * Disable MFA. Requires the current password AND a valid TOTP/recovery code
   * so a hijacked session alone can't turn it off.
   */
  async disableMfa(userId, { password, code }) {
    const user = await this.userRepo.findById(userId, {
      select: '+password +mfaSecret +mfaRecoveryCodes',
    });
    if (!user) throw new AppError('User not found', 404);
    if (!user.mfaEnabled) throw new AppError('MFA is not enabled', 400);

    if (!(await user.comparePassword(password))) {
      throw new AppError('Invalid password', 401);
    }
    if (!this._consumeMfaCode(user, code)) {
      throw new AppError('Invalid verification code', 401);
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaRecoveryCodes = undefined;
    await user.save();

    this.logger.info('MFA disabled', { userId: user._id });
    return { disabled: true };
  }

  /**
   * Verify a code against the user's TOTP secret, falling back to single-use
   * recovery codes (which are consumed in place). Returns true on success.
   */
  _consumeMfaCode(user, code) {
    if (this.mfa.verifyTotp(user.mfaSecret, code)) return true;

    const hash = this.mfa.hashRecoveryCode(code || '');
    const codes = user.mfaRecoveryCodes || [];
    const idx = codes.indexOf(hash);
    if (idx === -1) return false;

    codes.splice(idx, 1); // consume
    user.mfaRecoveryCodes = codes;
    return true;
  }

  /**
   * Result conventions:
   *   throws AppError 401 — caller should also clearAuthCookies(res)
   *   returns { accessToken, refreshToken } on success
   */
  async refreshTokens({ refreshTokenValue, deviceInfo }) {
    if (!refreshTokenValue) {
      throw new AppError('Refresh token required', 401);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenValue);
    } catch (error) {
      this.logger.warn('Invalid refresh token signature', { error: error.message });
      throw new AppError(error.message || 'Invalid refresh token', 401);
    }

    const user = await this.userRepo.findById(decoded.userId, { select: '+refreshTokens' });

    if (!user) {
      this.logger.warn('User not found for refresh token', { userId: decoded.userId });
      throw new AppError('Invalid refresh token', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is inactive', 401);
    }

    const incomingTokenHash = hashRefreshToken(refreshTokenValue);
    const tokenValid = await user.consumeRefreshToken(incomingTokenHash);

    if (!tokenValid) {
      // Possible theft — clear all refresh tokens
      this.logger.warn('Refresh token not found or already used - possible token theft', {
        userId: user._id,
      });
      await user.clearAllRefreshTokens();
      this.authAudit.logTokenTheftDetected?.({ userId: user._id });
      // A3: alert the user out-of-band that all sessions were revoked. Best-effort;
      // never block the 401 on email delivery.
      this._sendTokenTheftAlert(user);
      throw new AppError('Invalid refresh token. Please login again.', 401);
    }

    const newAccessToken = generateAccessToken({
      userId: user._id,
      email: user.email,
      role: user.role,
    });
    const newRefreshToken = generateRefreshToken({
      userId: user._id,
      email: user.email,
    });

    const newTokenHash = hashRefreshToken(newRefreshToken);
    await user.addRefreshToken(newTokenHash, deviceInfo);

    await this.userRepo.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

    this.logger.info('Tokens rotated successfully', { userId: user._id });
    this.authAudit.logTokenRefresh?.({ userId: user._id });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout({ userId, refreshTokenValue, logoutAll }) {
    const user = await this.userRepo.findById(userId, { select: '+refreshTokens' });
    if (!user) return;

    if (logoutAll) {
      await user.clearAllRefreshTokens();
      this.logger.info('User logged out from all devices', { userId: user._id });
      this.authAudit.logLogout?.({ userId: user._id, allDevices: true });
      return;
    }

    if (refreshTokenValue) {
      const tokenHash = hashRefreshToken(refreshTokenValue);
      await user.consumeRefreshToken(tokenHash);
    }
    this.logger.info('User logged out', { userId: user._id });
    this.authAudit.logLogout?.({ userId: user._id, allDevices: false });
  }

  async getMe(userId) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const organization = await this._resolveOrganizationSummary(user.organizationId);

    return {
      user: toUserPayload(user, {
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        organization,
      }),
    };
  }

  async updateProfile(userId, { name, email }) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!name && !email) {
      throw new AppError('No profile changes provided', 400);
    }
    if (email && email !== user.email) {
      throw new AppError('Email cannot be changed via profile update', 400);
    }

    if (name) user.name = name;

    await user.save();

    this.logger.info('User profile updated', { userId: user._id });

    const displayName = user.decryptField ? user.decryptField('name') : user.name;

    return {
      user: {
        id: user._id,
        email: user.email,
        name: displayName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    };
  }

  async forgotPassword({ email }) {
    const user = await this.userRepo.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      this.logger.info('Password reset requested for non-existent email', { email });
      return;
    }

    const resetToken = await user.createPasswordResetToken();

    const emailResult = await this.emailService.sendPasswordResetEmail({
      toEmail: user.email,
      toName: user.name,
      resetToken,
    });

    if (!emailResult.success) {
      this.logger.error('Failed to send password reset email', {
        userId: user._id,
        error: emailResult.error || emailResult.reason,
        reason: emailResult.reason,
      });
      await user.clearPasswordResetToken();
      throw new AppError(
        'Email service is temporarily unavailable. Please try again later or contact support.',
        503
      );
    }

    this.logger.info('Password reset email sent', { userId: user._id, email: user.email });
    this.authAudit.logPasswordResetRequest?.({ userId: user._id, email: user.email });
  }

  async resetPassword({ token, password }) {
    const hashedToken = sha256(token);

    const user = await this.userRepo.findOne(
      {
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      },
      { select: '+passwordResetToken +passwordResetExpires +refreshTokens' }
    );

    if (!user) {
      this.logger.warn('Invalid or expired password reset token');
      throw new AppError('Invalid or expired reset token. Please request a new one.', 400);
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // force re-login on all devices

    await user.save();

    this.logger.info('Password reset successful', { userId: user._id });
    this.authAudit.logPasswordResetSuccess?.({ userId: user._id });
  }

  async verifyEmail({ token }) {
    const hashedToken = sha256(token);

    const user = await this.userRepo.findOne(
      {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() },
      },
      { select: '+emailVerificationToken +emailVerificationExpires' }
    );

    if (!user) {
      this.logger.warn('Invalid or expired email verification token');
      throw new AppError('Invalid or expired verification token. Please request a new one.', 400);
    }

    const userName = user.name; // capture before save() re-encrypts

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    this.logger.info('Email verified successfully', {
      userId: user._id,
      email: user.email,
    });
    this.authAudit.logEmailVerified?.({ userId: user._id, email: user.email });

    this.emailService.sendWelcomeEmail({ toEmail: user.email, toName: userName }).catch((err) => {
      this.logger.warn('Failed to send welcome email after verification', {
        userId: user._id,
        error: err.message,
      });
    });
  }

  async resendVerification(userId) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (user.isEmailVerified) {
      throw new AppError('Email is already verified', 400);
    }

    if (user.emailVerificationLastSentAt) {
      const elapsedMs = Date.now() - user.emailVerificationLastSentAt.getTime();
      if (elapsedMs < RESEND_VERIFICATION_COOLDOWN_MS) {
        this.logger.warn('Resend verification blocked due to cooldown', { userId: user._id });
        const waitSeconds = Math.ceil((RESEND_VERIFICATION_COOLDOWN_MS - elapsedMs) / 1000);
        throw new AppError(
          `Please wait ${waitSeconds}s before requesting another verification email.`,
          429
        );
      }
    }

    const verificationToken = await user.createEmailVerificationToken();

    const emailResult = await this.emailService.sendEmailVerification({
      toEmail: user.email,
      toName: user.name,
      verificationToken,
    });

    if (!emailResult.success) {
      this.logger.error('Failed to resend verification email', {
        userId: user._id,
        error: emailResult.error || emailResult.reason,
        reason: emailResult.reason,
      });
      throw new AppError(
        'Email service is temporarily unavailable. Please try again later or contact support.',
        503
      );
    }

    this.logger.info('Verification email resent', {
      userId: user._id,
      email: user.email,
    });
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.userRepo.findById(userId, { select: '+password +refreshTokens' });
    if (!user) throw new AppError('User not found', 404);

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      this.logger.warn('Change password failed - incorrect current password', {
        userId: user._id,
      });
      throw new AppError('Current password is incorrect', 401);
    }

    user.password = newPassword;
    user.refreshTokens = []; // force re-login on all devices

    await user.save();

    this.logger.info('Password changed successfully - all sessions invalidated', {
      userId: user._id,
    });
  }

  async updateOnboarding(userId, { completed, checklist }) {
    const update = {};

    if (completed !== undefined) {
      update.onboardingCompleted = completed;
    }

    if (checklist && typeof checklist === 'object') {
      const allowed = [
        'vendorCreated',
        'assessmentCreated',
        'memberInvited',
        'monitoringSetup',
        'dismissed',
      ];
      for (const key of allowed) {
        if (checklist[key] !== undefined) {
          update[`onboardingChecklist.${key}`] = checklist[key];
        }
      }
    }

    if (Object.keys(update).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    await this.userRepo.updateOne({ _id: userId }, { $set: update });
  }
}

export const authService = new AuthService();
export { AuthService };

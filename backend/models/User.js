/**
 * User Model
 * Handles user authentication and account management
 * @module models/User
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';
import { sha256, generateToken } from '../utils/security/crypto.js';

/**
 * @typedef {Object} UserDocument
 * @property {mongoose.Types.ObjectId} _id - Unique identifier
 * @property {string} email - User email (unique, lowercase)
 * @property {string} password - Hashed password (excluded from queries by default)
 * @property {string} name - User display name
 * @property {'user'|'admin'} role - User role
 * @property {boolean} isActive - Whether account is active
 * @property {string} [refreshToken] - JWT refresh token (excluded by default)
 * @property {Date} [lastLogin] - Last successful login
 * @property {number} loginAttempts - Failed login attempts
 * @property {Date} [lockUntil] - Account lock expiry time
 * @property {boolean} isLocked - Virtual: whether account is locked
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} UserMethods
 * @property {function(string): Promise<boolean>} comparePassword - Compare password with hash
 * @property {function(): Promise<void>} incLoginAttempts - Increment failed login attempts
 * @property {function(): Promise<void>} resetLoginAttempts - Reset login attempts on success
 * @property {function(): Object} toJSON - Convert to JSON (excludes sensitive fields)
 */

/**
 * @typedef {Object} UserStatics
 * @property {function(string): Promise<UserDocument|null>} findByCredentials - Find user by email with password
 */

/**
 * @typedef {mongoose.Model<UserDocument> & UserStatics} UserModel
 */

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't include password in queries by default
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Hashed refresh tokens (supports multiple devices + rotation)
    refreshTokens: [
      {
        tokenHash: {
          type: String,
          required: true,
        },
        deviceInfo: {
          type: String,
          default: 'unknown',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
      },
    ],
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    // Email verification
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    emailVerificationLastSentAt: {
      type: Date,
    },
    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // Notification preferences
    notificationPreferences: {
      // In-app notifications
      inApp: {
        workspace_invitation: { type: Boolean, default: true },
        workspace_removed: { type: Boolean, default: true },
        permission_changed: { type: Boolean, default: true },
        member_joined: { type: Boolean, default: true },
        member_left: { type: Boolean, default: false },
        sync_completed: { type: Boolean, default: true },
        sync_failed: { type: Boolean, default: true },
        indexing_completed: { type: Boolean, default: false },
        indexing_failed: { type: Boolean, default: true },
        system_alert: { type: Boolean, default: true },
        token_limit_warning: { type: Boolean, default: true },
      },
      // Email notifications
      email: {
        workspace_invitation: { type: Boolean, default: true },
        workspace_removed: { type: Boolean, default: true },
        permission_changed: { type: Boolean, default: false },
        sync_failed: { type: Boolean, default: true },
        system_alert: { type: Boolean, default: true },
        token_limit_reached: { type: Boolean, default: true },
        notion_token_expired: { type: Boolean, default: true },
      },
    },
    // Notion token handling preference
    // 'notify' - Send email when token expires (default)
    // 'auto_reconnect' - Attempt automatic reconnection (future)
    notionTokenPreference: {
      type: String,
      enum: ['notify', 'auto_reconnect'],
      default: 'notify',
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for account locked status
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving (Mongoose 8 pattern - no next callback)
userSchema.pre('save', async function () {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return;
  }

  // Generate salt and hash password
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare a candidate password with the stored hash
 * @param {string} candidatePassword - Password to verify
 * @returns {Promise<boolean>} Whether password matches
 * @throws {Error} If comparison fails
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch {
    throw new Error('Password comparison failed');
  }
};

/**
 * Increment login attempts and lock account if threshold exceeded
 * Locks account for 2 hours after 5 failed attempts
 * @returns {Promise<void>}
 */
userSchema.methods.incLoginAttempts = async function () {
  // If lock has expired, reset attempts
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  // Otherwise increment attempts
  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

/**
 * Reset login attempts on successful login
 * Also updates lastLogin timestamp
 * @returns {Promise<void>}
 */
userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 },
  });
};

/**
 * Remove sensitive data when converting to JSON
 * Excludes: password, refreshTokens, loginAttempts, lockUntil
 * @returns {Object} Sanitized user object
 */
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.refreshTokens;
  delete user.loginAttempts;
  delete user.lockUntil;
  return user;
};

/**
 * Find user by email with sensitive fields included
 * Used for authentication - includes password, refreshTokens, loginAttempts, lockUntil
 * @param {string} email - User email address
 * @returns {Promise<UserDocument|null>} User with credentials or null
 */
userSchema.statics.findByCredentials = async function (email) {
  return this.findOne({ email }).select('+password +refreshTokens +loginAttempts +lockUntil');
};

/**
 * Add a hashed refresh token to user's token list
 * @param {string} tokenHash - SHA-256 hash of the refresh token
 * @param {string} deviceInfo - Device/client identifier
 * @param {number} expiryDays - Token expiry in days (default 7)
 * @returns {Promise<void>}
 */
userSchema.methods.addRefreshToken = async function (
  tokenHash,
  deviceInfo = 'unknown',
  expiryDays = 7
) {
  // Remove expired tokens first
  this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt > new Date());

  // Limit to 5 active sessions per user
  const MAX_SESSIONS = 5;
  if (this.refreshTokens.length >= MAX_SESSIONS) {
    // Remove oldest token
    this.refreshTokens.sort((a, b) => a.createdAt - b.createdAt);
    this.refreshTokens.shift();
  }

  this.refreshTokens.push({
    tokenHash,
    deviceInfo,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
  });

  await this.save();
};

/**
 * Find and validate a refresh token, then remove it (for rotation)
 * @param {string} tokenHash - SHA-256 hash of the refresh token to find
 * @returns {Promise<boolean>} Whether token was found and valid
 */
userSchema.methods.consumeRefreshToken = async function (tokenHash) {
  const tokenIndex = this.refreshTokens.findIndex(
    (t) => t.tokenHash === tokenHash && t.expiresAt > new Date()
  );

  if (tokenIndex === -1) {
    return false;
  }

  // Remove the consumed token (rotation - it will be replaced with new one)
  this.refreshTokens.splice(tokenIndex, 1);
  await this.save();

  return true;
};

/**
 * Remove all refresh tokens (logout from all devices)
 * @returns {Promise<void>}
 */
userSchema.methods.clearAllRefreshTokens = async function () {
  this.refreshTokens = [];
  await this.save();
};

/**
 * Generate password reset token
 * Token is valid for 1 hour
 * @returns {Promise<string>} Raw token to send via email
 */
userSchema.methods.createPasswordResetToken = async function () {
  // Generate random token
  const rawToken = generateToken(32);

  // Hash token for storage (don't store raw token in DB)
  this.passwordResetToken = sha256(rawToken);

  // Token expires in 1 hour
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000;

  await this.save({ validateBeforeSave: false });

  // Return raw token to send via email
  return rawToken;
};

/**
 * Verify password reset token
 * @param {string} rawToken - Raw token from email link
 * @returns {boolean} Whether token is valid
 */
userSchema.methods.verifyPasswordResetToken = function (rawToken) {
  const hashedToken = sha256(rawToken);

  return this.passwordResetToken === hashedToken && this.passwordResetExpires > Date.now();
};

/**
 * Clear password reset token after use
 * @returns {Promise<void>}
 */
userSchema.methods.clearPasswordResetToken = async function () {
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;
  await this.save({ validateBeforeSave: false });
};

/**
 * Generate email verification token
 * Token is valid for 24 hours
 * @returns {Promise<string>} Raw token to send via email
 */
userSchema.methods.createEmailVerificationToken = async function () {
  // Generate random token
  const rawToken = generateToken(32);

  // Hash token for storage
  this.emailVerificationToken = sha256(rawToken);

  // Token expires in 24 hours
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  this.emailVerificationLastSentAt = new Date();

  await this.save({ validateBeforeSave: false });

  return rawToken;
};

/**
 * Verify email with token
 * @param {string} rawToken - Raw token from email link
 * @returns {Promise<boolean>} Whether verification succeeded
 */
userSchema.methods.verifyEmail = async function (rawToken) {
  const hashedToken = sha256(rawToken);

  if (this.emailVerificationToken !== hashedToken || this.emailVerificationExpires < Date.now()) {
    return false;
  }

  this.isEmailVerified = true;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  await this.save({ validateBeforeSave: false });

  return true;
};

// Apply field-level encryption to PII
// Note: email is NOT encrypted because it's used for authentication lookups and unique index
// Password is already hashed with bcrypt, so no additional encryption needed
userSchema.plugin(createEncryptionPlugin(['name']));

export const User = mongoose.model('User', userSchema);

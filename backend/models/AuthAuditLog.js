/**
 * Auth Audit Log Model
 *
 * Stores authentication-related events for security auditing
 * - Login attempts (success/failure)
 * - Password changes
 * - Token refresh
 * - Account lockouts
 * - Suspicious activity
 *
 * @module models/AuthAuditLog
 */

import mongoose from 'mongoose';

/**
 * Auth event types
 */
export const AUTH_EVENTS = {
  // Login events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_BLOCKED_LOCKED: 'login_blocked_locked',
  LOGIN_BLOCKED_INACTIVE: 'login_blocked_inactive',

  // Logout events
  LOGOUT: 'logout',
  LOGOUT_ALL_DEVICES: 'logout_all_devices',

  // Registration
  REGISTER_SUCCESS: 'register_success',
  REGISTER_FAILED: 'register_failed',

  // Password events
  PASSWORD_CHANGE_SUCCESS: 'password_change_success',
  PASSWORD_CHANGE_FAILED: 'password_change_failed',
  PASSWORD_RESET_REQUEST: 'password_reset_request',
  PASSWORD_RESET_SUCCESS: 'password_reset_success',
  PASSWORD_RESET_FAILED: 'password_reset_failed',

  // Email verification
  EMAIL_VERIFICATION_SUCCESS: 'email_verification_success',
  EMAIL_VERIFICATION_FAILED: 'email_verification_failed',
  EMAIL_VERIFICATION_RESENT: 'email_verification_resent',

  // Token events
  TOKEN_REFRESH_SUCCESS: 'token_refresh_success',
  TOKEN_REFRESH_FAILED: 'token_refresh_failed',
  TOKEN_THEFT_DETECTED: 'token_theft_detected',

  // Security events
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  BRUTE_FORCE_DETECTED: 'brute_force_detected',
};

const authAuditLogSchema = new mongoose.Schema(
  {
    // Event type
    event: {
      type: String,
      required: true,
      enum: Object.values(AUTH_EVENTS),
      index: true,
    },

    // User information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      index: true,
    },

    // Request information
    ipAddress: {
      type: String,
      index: true,
    },
    userAgent: String,
    deviceInfo: String,

    // Event details
    success: {
      type: Boolean,
      default: true,
    },
    failureReason: String,

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // TTL - automatically delete logs after 90 days (configurable)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: false, // We use our own timestamp field
  }
);

// Compound indexes for common queries
authAuditLogSchema.index({ userId: 1, timestamp: -1 });
authAuditLogSchema.index({ email: 1, timestamp: -1 });
authAuditLogSchema.index({ event: 1, timestamp: -1 });
authAuditLogSchema.index({ ipAddress: 1, timestamp: -1 });
authAuditLogSchema.index({ success: 1, event: 1, timestamp: -1 });

export const AuthAuditLog = mongoose.model('AuthAuditLog', authAuditLogSchema);

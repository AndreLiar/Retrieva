/**
 * Auth Audit Service
 *
 * Handles logging of authentication events for security auditing
 * SECURITY FIX: Now uses Redis for scalable brute force detection
 *
 * @module services/authAuditService
 */

import { AuthAuditLog, AUTH_EVENTS } from '../models/AuthAuditLog.js';
import logger from '../config/logger.js';
import { redisConnection } from '../config/redis.js';

// Redis key prefixes for brute force detection
const REDIS_KEYS = {
  LOGIN_ATTEMPTS_IP: 'auth:attempts:ip:',
  LOGIN_ATTEMPTS_EMAIL: 'auth:attempts:email:',
  BLOCKED_IP: 'auth:blocked:ip:',
  BLOCKED_EMAIL: 'auth:blocked:email:',
};

// Brute force thresholds (configurable via env)
const BRUTE_FORCE_CONFIG = {
  maxAttemptsIP: parseInt(process.env.AUTH_MAX_ATTEMPTS_IP) || 10,
  maxAttemptsEmail: parseInt(process.env.AUTH_MAX_ATTEMPTS_EMAIL) || 5,
  windowSeconds: parseInt(process.env.AUTH_ATTEMPT_WINDOW_SECONDS) || 900, // 15 minutes
  blockDurationSeconds: parseInt(process.env.AUTH_BLOCK_DURATION_SECONDS) || 3600, // 1 hour
};

/**
 * Extract client info from request
 *
 * @param {Object} req - Express request object
 * @returns {Object} Client information
 */
function extractClientInfo(req) {
  return {
    ipAddress:
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection?.remoteAddress ||
      'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    deviceInfo: `${req.headers['user-agent']?.substring(0, 100) || 'unknown'}`,
  };
}

/**
 * Log an authentication event
 *
 * @param {Object} params - Event parameters
 * @param {string} params.event - Event type from AUTH_EVENTS
 * @param {Object} params.req - Express request object
 * @param {string} params.userId - User ID (optional)
 * @param {string} params.email - User email (optional)
 * @param {boolean} params.success - Whether event was successful
 * @param {string} params.failureReason - Reason for failure (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 */
async function logEvent({
  event,
  req,
  userId = null,
  email = null,
  success = true,
  failureReason = null,
  metadata = {},
}) {
  try {
    const clientInfo = req ? extractClientInfo(req) : {};

    const auditLog = new AuthAuditLog({
      event,
      userId,
      email: email?.toLowerCase(),
      ...clientInfo,
      success,
      failureReason,
      metadata,
    });

    await auditLog.save();

    // Also log to application logger for immediate visibility
    const logLevel = success ? 'info' : 'warn';
    logger[logLevel]('Auth audit event', {
      service: 'auth-audit',
      event,
      userId,
      email,
      success,
      failureReason,
      ip: clientInfo.ipAddress,
    });
  } catch (error) {
    // Don't throw - audit logging should never break the main flow
    logger.error('Failed to log auth audit event', {
      service: 'auth-audit',
      event,
      error: error.message,
    });
  }
}

/**
 * Log successful login
 */
async function logLoginSuccess(req, user) {
  await logEvent({
    event: AUTH_EVENTS.LOGIN_SUCCESS,
    req,
    userId: user._id,
    email: user.email,
    success: true,
  });
}

/**
 * Log failed login
 */
async function logLoginFailed(req, email, reason) {
  await logEvent({
    event: AUTH_EVENTS.LOGIN_FAILED,
    req,
    email,
    success: false,
    failureReason: reason,
  });
}

/**
 * Log login blocked due to locked account
 */
async function logLoginBlockedLocked(req, user) {
  await logEvent({
    event: AUTH_EVENTS.LOGIN_BLOCKED_LOCKED,
    req,
    userId: user._id,
    email: user.email,
    success: false,
    failureReason: 'Account locked',
    metadata: { lockUntil: user.lockUntil },
  });
}

/**
 * Log successful registration
 */
async function logRegisterSuccess(req, user) {
  await logEvent({
    event: AUTH_EVENTS.REGISTER_SUCCESS,
    req,
    userId: user._id,
    email: user.email,
    success: true,
  });
}

/**
 * Log logout
 */
async function logLogout(req, userId, allDevices = false) {
  await logEvent({
    event: allDevices ? AUTH_EVENTS.LOGOUT_ALL_DEVICES : AUTH_EVENTS.LOGOUT,
    req,
    userId,
    success: true,
  });
}

/**
 * Log password change
 */
async function logPasswordChange(req, userId, success, reason = null) {
  await logEvent({
    event: success ? AUTH_EVENTS.PASSWORD_CHANGE_SUCCESS : AUTH_EVENTS.PASSWORD_CHANGE_FAILED,
    req,
    userId,
    success,
    failureReason: reason,
  });
}

/**
 * Log password reset request
 */
async function logPasswordResetRequest(req, email, userFound) {
  await logEvent({
    event: AUTH_EVENTS.PASSWORD_RESET_REQUEST,
    req,
    email,
    success: true,
    metadata: { userExists: userFound },
  });
}

/**
 * Log password reset completion
 */
async function logPasswordReset(req, userId, success, reason = null) {
  await logEvent({
    event: success ? AUTH_EVENTS.PASSWORD_RESET_SUCCESS : AUTH_EVENTS.PASSWORD_RESET_FAILED,
    req,
    userId,
    success,
    failureReason: reason,
  });
}

/**
 * Log email verification
 */
async function logEmailVerification(req, userId, success, reason = null) {
  await logEvent({
    event: success ? AUTH_EVENTS.EMAIL_VERIFICATION_SUCCESS : AUTH_EVENTS.EMAIL_VERIFICATION_FAILED,
    req,
    userId,
    success,
    failureReason: reason,
  });
}

/**
 * Log token refresh
 */
async function logTokenRefresh(req, userId, success, reason = null) {
  await logEvent({
    event: success ? AUTH_EVENTS.TOKEN_REFRESH_SUCCESS : AUTH_EVENTS.TOKEN_REFRESH_FAILED,
    req,
    userId,
    success,
    failureReason: reason,
  });
}

/**
 * Log potential token theft (reuse of rotated token)
 */
async function logTokenTheftDetected(req, userId) {
  await logEvent({
    event: AUTH_EVENTS.TOKEN_THEFT_DETECTED,
    req,
    userId,
    success: false,
    failureReason: 'Reuse of rotated refresh token detected',
    metadata: { severity: 'high' },
  });
}

/**
 * Log account lockout
 */
async function logAccountLocked(req, userId, email, attemptCount) {
  await logEvent({
    event: AUTH_EVENTS.ACCOUNT_LOCKED,
    req,
    userId,
    email,
    success: false,
    failureReason: 'Too many failed login attempts',
    metadata: { attemptCount },
  });
}

/**
 * Log suspicious activity
 */
async function logSuspiciousActivity(req, userId, email, reason, metadata = {}) {
  await logEvent({
    event: AUTH_EVENTS.SUSPICIOUS_ACTIVITY,
    req,
    userId,
    email,
    success: false,
    failureReason: reason,
    metadata: { ...metadata, severity: 'medium' },
  });
}

/**
 * Get audit logs for a user
 *
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Audit logs
 */
async function getUserAuditLogs(userId, options = {}) {
  const { limit = 50, skip = 0, events = null, startDate = null, endDate = null } = options;

  const query = { userId };

  if (events && events.length > 0) {
    query.event = { $in: events };
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  return AuthAuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean();
}

/**
 * Get security summary for a user
 *
 * @param {string} userId - User ID
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} Security summary
 */
async function getSecuritySummary(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [loginCount, failedLoginCount, passwordChanges, suspiciousEvents, uniqueIPs] =
    await Promise.all([
      AuthAuditLog.countDocuments({
        userId,
        event: AUTH_EVENTS.LOGIN_SUCCESS,
        timestamp: { $gte: startDate },
      }),
      AuthAuditLog.countDocuments({
        userId,
        event: AUTH_EVENTS.LOGIN_FAILED,
        timestamp: { $gte: startDate },
      }),
      AuthAuditLog.countDocuments({
        userId,
        event: AUTH_EVENTS.PASSWORD_CHANGE_SUCCESS,
        timestamp: { $gte: startDate },
      }),
      AuthAuditLog.countDocuments({
        userId,
        event: { $in: [AUTH_EVENTS.SUSPICIOUS_ACTIVITY, AUTH_EVENTS.TOKEN_THEFT_DETECTED] },
        timestamp: { $gte: startDate },
      }),
      AuthAuditLog.distinct('ipAddress', {
        userId,
        event: AUTH_EVENTS.LOGIN_SUCCESS,
        timestamp: { $gte: startDate },
      }),
    ]);

  return {
    period: `${days} days`,
    successfulLogins: loginCount,
    failedLogins: failedLoginCount,
    passwordChanges,
    suspiciousEvents,
    uniqueLoginLocations: uniqueIPs.length,
    uniqueIPs,
  };
}

/**
 * Detect brute force attempts (MongoDB fallback)
 *
 * @param {string} ipAddress - IP address to check
 * @param {number} windowMinutes - Time window in minutes
 * @param {number} threshold - Number of failures to trigger alert
 * @returns {Promise<boolean>} Whether brute force is detected
 */
async function detectBruteForce(ipAddress, windowMinutes = 15, threshold = 10) {
  const startTime = new Date(Date.now() - windowMinutes * 60 * 1000);

  const failedAttempts = await AuthAuditLog.countDocuments({
    ipAddress,
    event: AUTH_EVENTS.LOGIN_FAILED,
    timestamp: { $gte: startTime },
  });

  if (failedAttempts >= threshold) {
    await logEvent({
      event: AUTH_EVENTS.BRUTE_FORCE_DETECTED,
      req: null,
      success: false,
      failureReason: `${failedAttempts} failed login attempts from IP`,
      metadata: {
        ipAddress,
        attemptCount: failedAttempts,
        windowMinutes,
        severity: 'high',
      },
    });
    return true;
  }

  return false;
}

// ============================================================================
// REDIS-BASED BRUTE FORCE DETECTION (Scalable across instances)
// ============================================================================

/**
 * Record a failed login attempt in Redis
 * SECURITY FIX: Scalable brute force detection using Redis
 *
 * @param {string} ipAddress - IP address of the attempt
 * @param {string} email - Email used in the attempt
 * @returns {Promise<Object>} Current attempt counts
 */
async function recordFailedAttempt(ipAddress, email) {
  try {
    const pipeline = redisConnection.pipeline();
    const now = Date.now();

    // Record IP-based attempt
    const ipKey = `${REDIS_KEYS.LOGIN_ATTEMPTS_IP}${ipAddress}`;
    pipeline.zadd(ipKey, now, `${now}`);
    pipeline.zremrangebyscore(ipKey, 0, now - BRUTE_FORCE_CONFIG.windowSeconds * 1000);
    pipeline.expire(ipKey, BRUTE_FORCE_CONFIG.windowSeconds);
    pipeline.zcard(ipKey);

    // Record email-based attempt (if email provided)
    if (email) {
      const emailKey = `${REDIS_KEYS.LOGIN_ATTEMPTS_EMAIL}${email.toLowerCase()}`;
      pipeline.zadd(emailKey, now, `${now}`);
      pipeline.zremrangebyscore(emailKey, 0, now - BRUTE_FORCE_CONFIG.windowSeconds * 1000);
      pipeline.expire(emailKey, BRUTE_FORCE_CONFIG.windowSeconds);
      pipeline.zcard(emailKey);
    }

    const results = await pipeline.exec();

    const ipAttempts = results[3]?.[1] || 0;
    const emailAttempts = email ? results[7]?.[1] || 0 : 0;

    logger.debug('Recorded failed login attempt', {
      service: 'auth-audit',
      ipAddress,
      email: email ? '[REDACTED]' : null,
      ipAttempts,
      emailAttempts,
    });

    return { ipAttempts, emailAttempts };
  } catch (error) {
    logger.error('Failed to record login attempt in Redis', {
      service: 'auth-audit',
      error: error.message,
    });
    return { ipAttempts: 0, emailAttempts: 0 };
  }
}

/**
 * Check if IP or email is currently blocked
 * SECURITY FIX: Fast Redis-based blocking check
 *
 * @param {string} ipAddress - IP address to check
 * @param {string} email - Email to check
 * @returns {Promise<Object>} Block status
 */
async function isBlocked(ipAddress, email) {
  try {
    const pipeline = redisConnection.pipeline();

    pipeline.get(`${REDIS_KEYS.BLOCKED_IP}${ipAddress}`);
    if (email) {
      pipeline.get(`${REDIS_KEYS.BLOCKED_EMAIL}${email.toLowerCase()}`);
    }

    const results = await pipeline.exec();

    const ipBlocked = !!results[0]?.[1];
    const emailBlocked = email ? !!results[1]?.[1] : false;

    return {
      blocked: ipBlocked || emailBlocked,
      ipBlocked,
      emailBlocked,
      reason: ipBlocked
        ? 'IP blocked due to too many failed attempts'
        : emailBlocked
          ? 'Account locked due to too many failed attempts'
          : null,
    };
  } catch (error) {
    logger.error('Failed to check block status in Redis', {
      service: 'auth-audit',
      error: error.message,
    });
    return { blocked: false, ipBlocked: false, emailBlocked: false };
  }
}

/**
 * Block an IP or email after too many failed attempts
 *
 * @param {string} ipAddress - IP to block
 * @param {string} email - Email to block
 * @param {string} reason - Reason for blocking
 */
async function blockForBruteForce(ipAddress, email, reason) {
  try {
    const pipeline = redisConnection.pipeline();
    const blockData = JSON.stringify({
      blockedAt: new Date().toISOString(),
      reason,
    });

    pipeline.setex(
      `${REDIS_KEYS.BLOCKED_IP}${ipAddress}`,
      BRUTE_FORCE_CONFIG.blockDurationSeconds,
      blockData
    );

    if (email) {
      pipeline.setex(
        `${REDIS_KEYS.BLOCKED_EMAIL}${email.toLowerCase()}`,
        BRUTE_FORCE_CONFIG.blockDurationSeconds,
        blockData
      );
    }

    await pipeline.exec();

    logger.warn('Blocked IP/email for brute force', {
      service: 'auth-audit',
      ipAddress,
      email: email ? '[REDACTED]' : null,
      blockDurationSeconds: BRUTE_FORCE_CONFIG.blockDurationSeconds,
      reason,
    });
  } catch (error) {
    logger.error('Failed to block in Redis', {
      service: 'auth-audit',
      error: error.message,
    });
  }
}

/**
 * Check and enforce brute force protection (Redis-based)
 * Call this BEFORE processing login attempts
 *
 * @param {string} ipAddress - IP address
 * @param {string} email - Email being used
 * @returns {Promise<Object>} { allowed: boolean, reason?: string }
 */
async function checkBruteForceProtection(ipAddress, email) {
  try {
    // First check if already blocked
    const blockStatus = await isBlocked(ipAddress, email);
    if (blockStatus.blocked) {
      return {
        allowed: false,
        reason: blockStatus.reason,
        blockedBy: blockStatus.ipBlocked ? 'ip' : 'email',
      };
    }

    return { allowed: true };
  } catch (error) {
    logger.error('Brute force check failed', {
      service: 'auth-audit',
      error: error.message,
    });
    // Fail open - don't block users if Redis is down
    return { allowed: true };
  }
}

/**
 * Handle failed login - record and potentially block
 * Call this AFTER a failed login attempt
 *
 * @param {string} ipAddress - IP address
 * @param {string} email - Email used
 * @returns {Promise<Object>} { shouldBlock: boolean, ipAttempts, emailAttempts }
 */
async function handleFailedLogin(ipAddress, email) {
  const { ipAttempts, emailAttempts } = await recordFailedAttempt(ipAddress, email);

  let shouldBlock = false;
  let blockReason = null;

  if (ipAttempts >= BRUTE_FORCE_CONFIG.maxAttemptsIP) {
    shouldBlock = true;
    blockReason = `${ipAttempts} failed attempts from IP in ${BRUTE_FORCE_CONFIG.windowSeconds / 60} minutes`;
  }

  if (email && emailAttempts >= BRUTE_FORCE_CONFIG.maxAttemptsEmail) {
    shouldBlock = true;
    blockReason = `${emailAttempts} failed attempts for email in ${BRUTE_FORCE_CONFIG.windowSeconds / 60} minutes`;
  }

  if (shouldBlock) {
    await blockForBruteForce(ipAddress, email, blockReason);

    // Also log to MongoDB for permanent audit
    await logEvent({
      event: AUTH_EVENTS.BRUTE_FORCE_DETECTED,
      req: null,
      email,
      success: false,
      failureReason: blockReason,
      metadata: {
        ipAddress,
        ipAttempts,
        emailAttempts,
        windowSeconds: BRUTE_FORCE_CONFIG.windowSeconds,
        severity: 'high',
      },
    });
  }

  return { shouldBlock, ipAttempts, emailAttempts, blockReason };
}

/**
 * Clear failed attempts on successful login
 *
 * @param {string} ipAddress - IP address
 * @param {string} email - Email
 */
async function clearFailedAttempts(ipAddress, email) {
  try {
    const pipeline = redisConnection.pipeline();

    pipeline.del(`${REDIS_KEYS.LOGIN_ATTEMPTS_IP}${ipAddress}`);
    if (email) {
      pipeline.del(`${REDIS_KEYS.LOGIN_ATTEMPTS_EMAIL}${email.toLowerCase()}`);
    }

    await pipeline.exec();

    logger.debug('Cleared failed login attempts', {
      service: 'auth-audit',
      ipAddress,
    });
  } catch (error) {
    logger.error('Failed to clear attempts in Redis', {
      service: 'auth-audit',
      error: error.message,
    });
  }
}

/**
 * Get brute force detection configuration
 */
function getBruteForceConfig() {
  return { ...BRUTE_FORCE_CONFIG };
}

// Export service
export const authAuditService = {
  // Event logging
  logEvent,
  logLoginSuccess,
  logLoginFailed,
  logLoginBlockedLocked,
  logRegisterSuccess,
  logLogout,
  logPasswordChange,
  logPasswordResetRequest,
  logPasswordReset,
  logEmailVerification,
  logTokenRefresh,
  logTokenTheftDetected,
  logAccountLocked,
  logSuspiciousActivity,

  // Query functions
  getUserAuditLogs,
  getSecuritySummary,

  // Brute force detection (MongoDB - fallback)
  detectBruteForce,

  // Redis-based brute force protection (SCALABLE)
  checkBruteForceProtection,
  handleFailedLogin,
  clearFailedAttempts,
  isBlocked,
  getBruteForceConfig,

  // Constants
  AUTH_EVENTS,
};

export default authAuditService;

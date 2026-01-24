/**
 * Abuse Detection Middleware
 *
 * GUARDRAIL: Detect and prevent abusive usage patterns:
 * - Identical question spam
 * - Rapid-fire requests
 * - Suspicious IP patterns
 * - Unusual access times
 * @module middleware/abuseDetection
 */

import { createHash } from 'crypto';
import logger from '../config/logger.js';
import { guardrailsConfig } from '../config/guardrails.js';
import { logSecurityEvent } from '../services/securityLogger.js';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} detected - Whether pattern was detected
 * @property {string} [pattern] - Name of detected pattern
 * @property {number} [count] - Number of occurrences
 * @property {number} [threshold] - Configured threshold
 * @property {number} [window] - Time window in seconds
 * @property {string} [action] - Action to take
 * @property {number} [hour] - Current hour (for unusual hours)
 */

/**
 * @typedef {Object} FlagStatus
 * @property {boolean} flagged - Whether user is flagged
 * @property {string} [reason] - Reason for flagging
 * @property {number} [until] - Unix timestamp when flag expires
 */

/**
 * @typedef {Object} AbuseDetectionInfo
 * @property {boolean} flagged - Whether abuse was detected
 * @property {DetectionResult[]} patterns - Detected patterns
 * @property {boolean} [requiresCaptcha] - Whether CAPTCHA is required
 * @property {boolean} [requiresReview] - Whether manual review needed
 */

/**
 * @typedef {Object} TokenLimitsInfo
 * @property {boolean} allowed - Whether user can make requests
 * @property {Object} daily - Daily usage info
 * @property {Object} monthly - Monthly usage info
 */

/**
 * @typedef {Request & { abuseDetection?: AbuseDetectionInfo, tokenLimits?: TokenLimitsInfo }} AbuseDetectionRequest
 */

/**
 * @typedef {Object} AbuseStats
 * @property {number} flaggedUsers - Number of currently flagged users
 * @property {number} trackedUsers - Number of users being tracked
 * @property {number} questionHashesCached - Number of cached question hashes
 */

// In-memory stores (consider Redis for production scaling)
const questionHashes = new Map(); // userId -> { hash -> count }
const requestTimestamps = new Map(); // userId -> [timestamps]
const flaggedUsers = new Map(); // userId -> { reason, until }

/**
 * Clean up old entries periodically
 * Removes expired timestamps, hashes, and flag entries
 * @private
 */
function cleanupOldEntries() {
  const now = Date.now();
  const oneHour = 3600 * 1000;

  // Clean request timestamps older than 1 hour
  for (const [userId, timestamps] of requestTimestamps.entries()) {
    const filtered = timestamps.filter((t) => now - t < oneHour);
    if (filtered.length === 0) {
      requestTimestamps.delete(userId);
    } else {
      requestTimestamps.set(userId, filtered);
    }
  }

  // Clean question hashes older than 1 hour
  for (const [userId, hashes] of questionHashes.entries()) {
    if (hashes.firstSeen && now - hashes.firstSeen > oneHour) {
      questionHashes.delete(userId);
    }
  }

  // Clean expired flagged users
  for (const [userId, flag] of flaggedUsers.entries()) {
    if (flag.until && now > flag.until) {
      flaggedUsers.delete(userId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Hash a question for comparison (case-insensitive)
 * @param {string} question - Question to hash
 * @returns {string} MD5 hash of normalized question
 * @private
 */
function hashQuestion(question) {
  return createHash('md5').update(question.toLowerCase().trim()).digest('hex');
}

/**
 * Check for identical question spam
 * Tracks question hashes per user and detects repeated questions
 *
 * @param {string} userId - User ID or IP address
 * @param {string} question - Question being asked
 * @returns {DetectionResult} Detection result with pattern info
 * @private
 */
function checkIdenticalQuestions(userId, question) {
  const config = guardrailsConfig.abuseDetection.patterns.identicalQuestions;
  const hash = hashQuestion(question);

  if (!questionHashes.has(userId)) {
    questionHashes.set(userId, { firstSeen: Date.now(), hashes: new Map() });
  }

  const userHashes = questionHashes.get(userId);
  const count = (userHashes.hashes.get(hash) || 0) + 1;
  userHashes.hashes.set(hash, count);

  if (count >= config.threshold) {
    return {
      detected: true,
      pattern: 'identical_questions',
      count,
      threshold: config.threshold,
      action: config.action,
    };
  }

  return { detected: false };
}

/**
 * Check for rapid-fire requests
 * Tracks request timestamps per user within a sliding window
 *
 * @param {string} userId - User ID or IP address
 * @returns {DetectionResult} Detection result with pattern info
 * @private
 */
function checkRapidRequests(userId) {
  const config = guardrailsConfig.abuseDetection.patterns.rapidRequests;
  const now = Date.now();

  if (!requestTimestamps.has(userId)) {
    requestTimestamps.set(userId, []);
  }

  const timestamps = requestTimestamps.get(userId);
  timestamps.push(now);

  // Count requests in the window
  const windowStart = now - config.window * 1000;
  const recentRequests = timestamps.filter((t) => t > windowStart);
  requestTimestamps.set(userId, recentRequests);

  if (recentRequests.length >= config.threshold) {
    return {
      detected: true,
      pattern: 'rapid_requests',
      count: recentRequests.length,
      window: config.window,
      threshold: config.threshold,
      action: config.action,
    };
  }

  return { detected: false };
}

/**
 * Check if request is during unusual hours (2 AM - 5 AM)
 * @returns {DetectionResult} Detection result with hour info
 * @private
 */
function checkUnusualHours() {
  const config = guardrailsConfig.abuseDetection.patterns.unusualHours;

  if (!config.enabled) return { detected: false };

  const hour = new Date().getHours();
  // Consider 2 AM - 5 AM as unusual hours
  const isUnusual = hour >= 2 && hour <= 5;

  return {
    detected: isUnusual,
    pattern: 'unusual_hours',
    hour,
    action: 'flag_for_review',
  };
}

/**
 * Check if user is currently flagged for abuse
 * @param {string} userId - User ID or IP address
 * @returns {FlagStatus} Flag status with reason and expiry
 * @private
 */
function isUserFlagged(userId) {
  const flag = flaggedUsers.get(userId);

  if (!flag) return { flagged: false };

  const now = Date.now();
  if (flag.until && now > flag.until) {
    flaggedUsers.delete(userId);
    return { flagged: false };
  }

  return {
    flagged: true,
    reason: flag.reason,
    until: flag.until,
  };
}

/**
 * Flag a user temporarily for abuse
 * @param {string} userId - User ID or IP address
 * @param {string} reason - Reason for flagging
 * @param {number} [durationMs=3600000] - Duration in milliseconds (default 1 hour)
 * @private
 */
function flagUser(userId, reason, durationMs = 3600000) {
  flaggedUsers.set(userId, {
    reason,
    until: Date.now() + durationMs,
    flaggedAt: Date.now(),
  });
}

/**
 * Main abuse detection middleware
 * Checks for various abuse patterns and takes appropriate action
 *
 * @param {AbuseDetectionRequest} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 */
export function detectAbuse(req, res, next) {
  const userId = req.user?.userId || req.ip;
  const question = req.body?.question;

  // Check if user is currently flagged
  const flagCheck = isUserFlagged(userId);
  if (flagCheck.flagged) {
    logger.warn('Request from flagged user', {
      userId,
      reason: flagCheck.reason,
      guardrail: 'abuse_detection',
    });

    logSecurityEvent('abuse_detection_blocked', {
      userId,
      ip: req.ip,
      reason: flagCheck.reason,
      endpoint: req.originalUrl,
    });

    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((flagCheck.until - Date.now()) / 1000),
      guardrail: 'abuse_detection',
    });
  }

  const detectedPatterns = [];

  // Check for rapid requests
  const rapidCheck = checkRapidRequests(userId);
  if (rapidCheck.detected) {
    detectedPatterns.push(rapidCheck);
  }

  // Check for identical question spam (only if there's a question)
  if (question) {
    const identicalCheck = checkIdenticalQuestions(userId, question);
    if (identicalCheck.detected) {
      detectedPatterns.push(identicalCheck);
    }
  }

  // Check unusual hours
  const hoursCheck = checkUnusualHours();
  if (hoursCheck.detected) {
    detectedPatterns.push(hoursCheck);
  }

  // Handle detected patterns
  if (detectedPatterns.length > 0) {
    const mostSevere = detectedPatterns.reduce((a, b) =>
      getActionSeverity(a.action) > getActionSeverity(b.action) ? a : b
    );

    logger.warn('Abuse pattern detected', {
      userId,
      ip: req.ip,
      patterns: detectedPatterns.map((p) => p.pattern),
      action: mostSevere.action,
      guardrail: 'abuse_detection',
    });

    logSecurityEvent('abuse_pattern_detected', {
      userId,
      ip: req.ip,
      patterns: detectedPatterns,
      action: mostSevere.action,
      endpoint: req.originalUrl,
      question: question ? hashQuestion(question) : null,
    });

    // Take action based on the pattern
    switch (mostSevere.action) {
      case 'temporary_block':
        flagUser(userId, mostSevere.pattern, 3600000); // 1 hour block
        return res.status(429).json({
          status: 'error',
          message: 'Unusual activity detected. Your access has been temporarily limited.',
          retryAfter: 3600,
          guardrail: 'abuse_detection',
        });

      case 'flag_and_captcha':
        // For now, just add a flag to the response
        req.abuseDetection = {
          flagged: true,
          patterns: detectedPatterns,
          requiresCaptcha: true,
        };
        break;

      case 'flag_for_review':
        req.abuseDetection = {
          flagged: true,
          patterns: detectedPatterns,
          requiresReview: true,
        };
        break;

      default:
        // Log only
        req.abuseDetection = {
          flagged: false,
          patterns: detectedPatterns,
        };
    }
  }

  // Attach detection stats to request for downstream use
  req.abuseDetection = req.abuseDetection || { flagged: false, patterns: [] };

  next();
}

/**
 * Get severity level for an action
 * @param {string} action - Action name
 * @returns {number} Severity level (1-5)
 * @private
 */
function getActionSeverity(action) {
  const severityMap = {
    log: 1,
    flag_for_review: 2,
    flag_and_captcha: 3,
    temporary_block: 4,
    permanent_block: 5,
  };
  return severityMap[action] || 0;
}

/**
 * Middleware to check token usage limits
 * Blocks requests if user has exceeded daily or monthly token limits
 *
 * @param {AbuseDetectionRequest} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {Promise<void>}
 */
export async function checkTokenLimits(req, res, next) {
  const userId = req.user?.userId;

  if (!userId) {
    return next();
  }

  try {
    const { TokenUsage } = await import('../models/TokenUsage.js');
    const limits = await TokenUsage.checkLimits(userId);

    if (!limits.allowed) {
      logger.warn('User exceeded token limits', {
        userId,
        daily: limits.daily,
        monthly: limits.monthly,
        guardrail: 'token_limits',
      });

      logSecurityEvent('token_limit_exceeded', {
        userId,
        daily: limits.daily,
        monthly: limits.monthly,
      });

      return res.status(429).json({
        status: 'error',
        message: 'Token usage limit exceeded. Please try again later.',
        limits: {
          daily: {
            used: limits.daily.used,
            limit: limits.daily.limit,
            percentUsed: limits.daily.percentUsed,
          },
          monthly: {
            used: limits.monthly.used,
            limit: limits.monthly.limit,
            percentUsed: limits.monthly.percentUsed,
          },
        },
        guardrail: 'token_limits',
      });
    }

    // Attach limits to request for downstream logging
    req.tokenLimits = limits;

    next();
  } catch (error) {
    logger.error('Error checking token limits', { error: error.message });
    // Don't block on error, just continue
    next();
  }
}

/**
 * Get current abuse detection statistics
 * Useful for monitoring dashboards
 *
 * @returns {AbuseStats} Current abuse detection statistics
 */
export function getAbuseStats() {
  return {
    flaggedUsers: flaggedUsers.size,
    trackedUsers: requestTimestamps.size,
    questionHashesCached: questionHashes.size,
  };
}

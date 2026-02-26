/**
 * RAG-Specific Rate Limiting Middleware
 *
 * SECURITY FIX (GAP 4): Strict rate limiting for expensive RAG endpoints
 * Each RAG request triggers 3+ LLM calls, making them a DDoS vector.
 */

import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

/**
 * Generate a rate limit key from request
 * Uses user ID if authenticated, otherwise normalized IP
 */
function generateKey(req, prefix = '') {
  if (req.user?.id && req.user.id !== 'anonymous') {
    return `${prefix}user:${req.user.id}`;
  }
  // Use a simple IP string (express-rate-limit handles IPv6 normalization by default)
  return `${prefix}ip:${req.ip || 'unknown'}`;
}

/**
 * Strict rate limiter for RAG query endpoints
 * Much lower limits than general API due to expensive LLM operations
 */
export const ragQueryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: (req) => {
    // Authenticated users get higher limits
    if (req.user?.id && req.user.id !== 'anonymous') {
      return 100; // 100 requests/hour for authenticated users
    }
    return 20; // 20 requests/hour for anonymous users
  },
  message: {
    status: 'error',
    message: 'Too many RAG queries. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateKey(req, 'rag:'),
  validate: { ip: false, trustProxy: false }, // Disable IP validation warnings
  handler: (req, res, next, options) => {
    logger.warn('RAG rate limit exceeded', {
      service: 'rate-limiter',
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
      path: req.path,
    });
    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path.includes('/health');
  },
});

/**
 * Even stricter limiter for streaming endpoints
 * Streaming is more resource-intensive
 */
export const ragStreamLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: (req) => {
    if (req.user?.id && req.user.id !== 'anonymous') {
      return 50; // 50 streaming requests/hour for authenticated
    }
    return 10; // 10 streaming requests/hour for anonymous
  },
  message: {
    status: 'error',
    message: 'Too many streaming requests. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateKey(req, 'stream:'),
  validate: { ip: false, trustProxy: false },
  handler: (req, res, next, options) => {
    logger.warn('RAG streaming rate limit exceeded', {
      service: 'rate-limiter',
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

/**
 * Burst limiter to prevent rapid-fire requests
 * Blocks if more than 5 requests in 10 seconds
 */
export const ragBurstLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 second window
  max: 5, // Max 5 requests per 10 seconds
  message: {
    status: 'error',
    message: 'Too many requests in short period. Please slow down.',
    retryAfter: '10 seconds',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateKey(req, 'burst:'),
  validate: { ip: false, trustProxy: false },
  handler: (req, res, next, options) => {
    logger.warn('RAG burst limit exceeded', {
      service: 'rate-limiter',
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

/**
 * Rate limiter for GET /notifications/count
 *
 * Keyed by user ID (all callers are authenticated).
 * Primary delivery is WebSocket push — HTTP is only the initial load
 * plus a 5-minute reconciliation poll, so we can afford to be generous
 * here without impacting the global 1 000 req/hr shared budget.
 *
 * 120 req/hr headroom: poll (12/hr) + multiple open tabs + manual refreshes.
 */
export const notificationCountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 120,
  message: {
    status: 'error',
    message: 'Too many notification count requests. Please slow down.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use the authenticated user ID so shared IPs (offices, NAT) don't bleed
  // into each other's quota. Falls back to IP when userId is unavailable.
  keyGenerator: (req) => `notif-count:${req.user?.userId || req.ip}`,
  validate: { ip: false, trustProxy: false, keyGeneratorIpFallback: false },
  handler: (req, res, _next, options) => {
    logger.warn('Notification count rate limit exceeded', {
      service: 'rate-limiter',
      ip: req.ip,
      userId: req.user?.userId || 'anonymous',
    });
    res.status(429).json(options.message);
  },
});

/**
 * Evaluation endpoint limiter (calls external RAGAS service)
 */
export const evaluationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 evaluations per hour
  message: {
    status: 'error',
    message: 'Too many evaluation requests. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => generateKey(req, 'eval:'),
  validate: { ip: false, trustProxy: false },
});

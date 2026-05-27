/**
 * Auth-specific rate limiting middleware
 *
 * The global limiter in app.js (1000 req/hr) is too loose for credential
 * surfaces. These limiters apply per IP per endpoint with tighter caps
 * so credential stuffing / spray attacks can't blow past the global cap.
 *
 * Layering with existing protections:
 *   - User.incLoginAttempts → 2-hour account lock after 5 password failures
 *     (applies regardless of IP rotation)
 *   - This middleware → per-IP cap (applies even before a user exists)
 *
 * Disabled when AUTH_RATE_LIMIT_DISABLED=true so integration tests can run
 * without inflating counters or hitting limits.
 */

import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

const DISABLED = process.env.AUTH_RATE_LIMIT_DISABLED === 'true';

function makeLimiter({ name, windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => DISABLED,
    // Key by IP. We deliberately do NOT key by user — the point is to
    // protect endpoints that establish identity, before a user is known.
    keyGenerator: (req) => `auth:${name}:${req.ip || 'unknown'}`,
    validate: { ip: false, trustProxy: false },
    message: { status: 'fail', message },
    handler: (req, res, _next, options) => {
      logger.warn('Auth rate limit exceeded', {
        service: 'auth-rate-limiter',
        limiter: name,
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      res.status(options.statusCode).json(options.message);
    },
  });
}

// Login: legit users retry after typos. Allow 10 attempts in 15 min per IP.
export const loginLimiter = makeLimiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

// Register: rare event. 5 per hour per IP is plenty for genuine users
// and slows down account-creation spam.
export const registerLimiter = makeLimiter({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts. Please try again in an hour.',
});

// Forgot/reset password: 5 per hour per IP. Higher than register because
// a user typing a wrong email isn't necessarily abusive, but enumeration
// loops should still be cut off.
export const passwordResetLimiter = makeLimiter({
  name: 'password-reset',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again in an hour.',
});

// Email verify: hash-token endpoint, 10/hour is generous.
export const emailVerifyLimiter = makeLimiter({
  name: 'email-verify',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many email verification attempts. Please try again in an hour.',
});

// Resend verification: stacks on top of the controller-side 60s cooldown.
export const resendVerifyLimiter = makeLimiter({
  name: 'resend-verify',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many verification email requests. Please try again in an hour.',
});

// Refresh: legit clients hit this every ~15 min. 60/hour leaves wide headroom
// for multi-tab usage while bounding token-replay attempts.
export const refreshLimiter = makeLimiter({
  name: 'refresh',
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Too many refresh attempts. Please try again later.',
});

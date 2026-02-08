/**
 * CSRF Protection Middleware
 *
 * Implements CSRF protection for state-changing requests when using
 * cookie-based authentication. Uses the Double Submit Cookie pattern.
 *
 * How it works:
 * 1. Server generates a CSRF token and sends it as a cookie AND in response body
 * 2. Client must send the token back in a header (X-CSRF-Token) for state-changing requests
 * 3. Server verifies the header matches the cookie
 *
 * @module middleware/csrfProtection
 */

import crypto from 'crypto';
import logger from '../config/logger.js';
import { generateToken as generateCryptoToken } from '../utils/security/crypto.js';

/**
 * Configuration
 */
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

// Methods that require CSRF protection (state-changing)
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Paths to exclude from CSRF protection (public API endpoints, webhooks)
const EXCLUDED_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/api/v1/notion/callback', // OAuth callback
  '/api/v1/notion/webhook', // Webhook endpoint
  '/health',
];

/**
 * Generate a cryptographically secure CSRF token
 * @returns {string} CSRF token
 */
function generateToken() {
  return generateCryptoToken(TOKEN_LENGTH);
}

/**
 * Set CSRF token cookie
 * @param {Object} res - Express response
 * @param {string} token - CSRF token
 */
function setTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Client needs to read this to send in header
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });
}

/**
 * Get CSRF token from request
 * @param {Object} req - Express request
 * @returns {Object} { headerToken, cookieToken }
 */
function getTokens(req) {
  return {
    headerToken: req.headers[CSRF_HEADER_NAME],
    cookieToken: req.cookies?.[CSRF_COOKIE_NAME],
  };
}

/**
 * Check if path should be excluded from CSRF protection
 * @param {string} path - Request path
 * @returns {boolean}
 */
function isExcluded(path) {
  return EXCLUDED_PATHS.some((excluded) => {
    if (excluded.endsWith('*')) {
      return path.startsWith(excluded.slice(0, -1));
    }
    return path === excluded || path.startsWith(excluded + '/');
  });
}

/**
 * CSRF Protection Middleware
 *
 * Generates CSRF token for GET requests and validates for state-changing requests.
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Enable/disable CSRF protection (default: true)
 * @param {Array<string>} options.excludePaths - Additional paths to exclude
 * @returns {Function} Express middleware
 */
export function csrfProtection(options = {}) {
  const { enabled = process.env.CSRF_ENABLED !== 'false', excludePaths = [] } = options;

  const allExcludedPaths = [...EXCLUDED_PATHS, ...excludePaths];

  return (req, res, next) => {
    // Skip if disabled
    if (!enabled) {
      return next();
    }

    // Skip for excluded paths
    if (isExcluded(req.path) || allExcludedPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    // For GET/HEAD/OPTIONS - generate or refresh token
    if (!PROTECTED_METHODS.includes(req.method)) {
      // Generate new token if not present
      let token = req.cookies?.[CSRF_COOKIE_NAME];
      if (!token) {
        token = generateToken();
        setTokenCookie(res, token);
      }

      // Attach token to response locals for templates
      res.locals.csrfToken = token;

      // Add helper to get token in response
      res.csrfToken = () => token;

      return next();
    }

    // For state-changing methods - validate token
    const { headerToken, cookieToken } = getTokens(req);

    // Check if both tokens exist
    if (!headerToken || !cookieToken) {
      logger.warn('CSRF validation failed - missing token', {
        service: 'csrf',
        path: req.path,
        method: req.method,
        hasHeader: !!headerToken,
        hasCookie: !!cookieToken,
        ip: req.ip,
      });

      return res.status(403).json({
        success: false,
        message: 'CSRF token missing. Please refresh the page and try again.',
        code: 'CSRF_TOKEN_MISSING',
      });
    }

    // Validate tokens match (timing-safe comparison)
    try {
      const headerBuffer = Buffer.from(headerToken);
      const cookieBuffer = Buffer.from(cookieToken);

      if (
        headerBuffer.length !== cookieBuffer.length ||
        !crypto.timingSafeEqual(headerBuffer, cookieBuffer)
      ) {
        throw new Error('Token mismatch');
      }
    } catch (_error) {
      logger.warn('CSRF validation failed - token mismatch', {
        service: 'csrf',
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      return res.status(403).json({
        success: false,
        message: 'CSRF token invalid. Please refresh the page and try again.',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    // Generate new token after successful validation (token rotation)
    const newToken = generateToken();
    setTokenCookie(res, newToken);
    res.locals.csrfToken = newToken;

    next();
  };
}

/**
 * Endpoint to get a fresh CSRF token
 * GET /api/v1/csrf-token
 */
export function getCsrfToken(req, res) {
  const token = generateToken();
  setTokenCookie(res, token);

  res.json({
    success: true,
    csrfToken: token,
  });
}

/**
 * Middleware to add CSRF token to all JSON responses
 * Useful for SPA applications
 */
export function attachCsrfToResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (data) => {
    if (typeof data === 'object' && data !== null && res.locals.csrfToken) {
      data._csrf = res.locals.csrfToken;
    }
    return originalJson(data);
  };

  next();
}

export default csrfProtection;

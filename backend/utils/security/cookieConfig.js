/**
 * Cookie Configuration for Secure Authentication
 *
 * Implements HTTP-only cookies for XSS-proof token storage
 *
 * @module utils/cookieConfig
 */

/**
 * Environment detection
 */
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Cookie configuration for access token
 * Short-lived token for API authentication
 */
export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true, // Not accessible via JavaScript (XSS protection)
  secure: isProduction, // HTTPS only in production
  sameSite: 'strict', // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/', // Available for all routes
};

/**
 * Cookie configuration for refresh token
 * Longer-lived token, only sent to refresh endpoint
 */
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth', // Only sent to auth routes
};

/**
 * Cookie names
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
};

/**
 * Set authentication cookies on response
 *
 * @param {import('express').Response} res - Express response object
 * @param {Object} tokens - Token pair
 * @param {string} tokens.accessToken - JWT access token
 * @param {string} tokens.refreshToken - JWT refresh token
 */
export function setAuthCookies(res, tokens) {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);
}

/**
 * Set only access token cookie (used after refresh)
 *
 * @param {import('express').Response} res - Express response object
 * @param {string} accessToken - JWT access token
 */
export function setAccessTokenCookie(res, accessToken) {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
}

/**
 * Clear authentication cookies on response
 *
 * @param {import('express').Response} res - Express response object
 */
export function clearAuthCookies(res) {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  });

  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}

/**
 * Get access token from request
 * Checks cookies first, then falls back to Authorization header
 * (Supports both cookie-based auth and API clients using headers)
 *
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} - Access token or null
 */
export function getAccessToken(req) {
  // First check cookies (primary method)
  if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
    return req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
  }

  // Fallback to Authorization header (for API clients, mobile apps, etc.)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Get refresh token from request
 *
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} - Refresh token or null
 */
export function getRefreshToken(req) {
  // First check cookies
  if (req.cookies && req.cookies[COOKIE_NAMES.REFRESH_TOKEN]) {
    return req.cookies[COOKIE_NAMES.REFRESH_TOKEN];
  }

  // Fallback to request body (for API clients)
  if (req.body && req.body.refreshToken) {
    return req.body.refreshToken;
  }

  return null;
}

export default {
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_OPTIONS,
  COOKIE_NAMES,
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
  getAccessToken,
  getRefreshToken,
};

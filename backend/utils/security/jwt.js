import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import logger from '../../config/logger.js';
import { sha256, timingSafeEqual } from './crypto.js';

// ---------------------------------------------------------------------------
// JWT secret rotation (audit gap A4)
//
// Tokens are always SIGNED with the current/primary secret. Verification tries
// the primary first, then any PREVIOUS secrets, so a key can be rotated with
// zero downtime:
//   1. Deploy: JWT_ACCESS_SECRET=<new>, JWT_ACCESS_SECRET_PREVIOUS=<old>
//      → new tokens use <new>; in-flight tokens still verify against <old>.
//   2. After the max token TTL (refresh = 7d) elapses, drop the PREVIOUS var.
// JWT_*_SECRET_PREVIOUS accepts a comma-separated list to overlap several keys.
// ---------------------------------------------------------------------------
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  const error = new Error(
    'FATAL: JWT secrets not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables.'
  );
  logger.error(error.message);
  throw error;
}

// Parse a comma-separated list of previous secrets (for verification only).
const parsePreviousSecrets = (raw) =>
  (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Verification key sets: primary first, then previous keys (newest-rotated first).
const ACCESS_VERIFY_SECRETS = [
  ACCESS_TOKEN_SECRET,
  ...parsePreviousSecrets(process.env.JWT_ACCESS_SECRET_PREVIOUS),
];
const REFRESH_VERIFY_SECRETS = [
  REFRESH_TOKEN_SECRET,
  ...parsePreviousSecrets(process.env.JWT_REFRESH_SECRET_PREVIOUS),
];

// Validate minimum secret length (256 bits = 32 characters minimum recommended)
const MIN_SECRET_LENGTH = 32;
if (
  [...ACCESS_VERIFY_SECRETS, ...REFRESH_VERIFY_SECRETS].some((s) => s.length < MIN_SECRET_LENGTH)
) {
  logger.warn(`JWT secrets should be at least ${MIN_SECRET_LENGTH} characters for security`);
}

/**
 * Verify a token against an ordered list of secrets (rotation-aware).
 * Retries the next secret only on a signature mismatch; expiry / malformed /
 * audience / issuer errors are terminal and not key-related.
 * @param {string} token
 * @param {string[]} secrets - primary first, then previous
 * @param {{ expired: string, invalid: string }} messages - error text to surface
 * @returns {Object} decoded payload
 */
const verifyWithRotation = (token, secrets, messages) => {
  let lastError;
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, { issuer: 'rag-backend', audience: 'rag-api' });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' && error.message === 'invalid signature') {
        lastError = error; // signed with a different key — try the next one
        continue;
      }
      lastError = error;
      break; // expired / malformed / wrong issuer|audience — no other key helps
    }
  }
  if (lastError?.name === 'TokenExpiredError') throw new Error(messages.expired);
  if (lastError?.name === 'JsonWebTokenError') throw new Error(messages.invalid);
  throw lastError;
};

// Token expiration times
const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d'; // 7 days

/**
 * Hash a refresh token for secure storage
 * @param {string} token - Raw refresh token
 * @returns {string} SHA-256 hash of the token
 */
export const hashRefreshToken = (token) => {
  return sha256(token);
};

/**
 * Compare a raw token against a stored hash
 * @param {string} rawToken - Raw refresh token from client
 * @param {string} hashedToken - Stored hash from database
 * @returns {boolean} Whether tokens match
 */
export const compareRefreshToken = (rawToken, hashedToken) => {
  const hash = hashRefreshToken(rawToken);
  return timingSafeEqual(hash, hashedToken);
};

/**
 * Generate access token (short-lived)
 * @param {Object} payload - User data to encode
 * @returns {string} JWT access token
 */
export const generateAccessToken = (payload) => {
  try {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: 'rag-backend',
        audience: 'rag-api',
      }
    );
  } catch (error) {
    logger.error('Failed to generate access token', { error: error.message });
    throw new Error('Token generation failed');
  }
};

/**
 * Generate refresh token (long-lived)
 * @param {Object} payload - User data to encode
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  try {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        jti: randomUUID(),
      },
      REFRESH_TOKEN_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: 'rag-backend',
        audience: 'rag-api',
      }
    );
  } catch (error) {
    logger.error('Failed to generate refresh token', { error: error.message });
    throw new Error('Token generation failed');
  }
};

/**
 * Verify access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
  return verifyWithRotation(token, ACCESS_VERIFY_SECRETS, {
    expired: 'Access token expired',
    invalid: 'Invalid access token',
  });
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  return verifyWithRotation(token, REFRESH_VERIFY_SECRETS, {
    expired: 'Refresh token expired',
    invalid: 'Invalid refresh token',
  });
};

/**
 * Generate both access and refresh tokens
 * @param {Object} payload - User data
 * @returns {Object} { accessToken, refreshToken }
 */
export const generateTokenPair = (payload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

// Short-lived token issued after password auth when MFA is required. It only
// proves "this user passed step 1"; the distinct audience ('rag-mfa') means it
// can never be accepted as an access token, and vice versa.
const MFA_TOKEN_EXPIRY = process.env.JWT_MFA_EXPIRY || '5m';

/**
 * Generate an MFA challenge token (step-1 → step-2 handoff).
 * @param {Object} payload - { userId }
 * @returns {string} JWT
 */
export const generateMfaToken = (payload) => {
  return jwt.sign({ userId: payload.userId, purpose: 'mfa' }, ACCESS_TOKEN_SECRET, {
    expiresIn: MFA_TOKEN_EXPIRY,
    issuer: 'rag-backend',
    audience: 'rag-mfa',
  });
};

/**
 * Verify an MFA challenge token.
 * @param {string} token
 * @returns {Object} decoded payload ({ userId, purpose })
 */
export const verifyMfaToken = (token) => {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET, {
      issuer: 'rag-backend',
      audience: 'rag-mfa',
    });
    if (decoded.purpose !== 'mfa') throw new Error('Invalid MFA token');
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('MFA session expired. Please log in again.');
    }
    throw new Error('Invalid MFA token');
  }
};

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

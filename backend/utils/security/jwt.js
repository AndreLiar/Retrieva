import jwt from 'jsonwebtoken';
import logger from '../../config/logger.js';
import { sha256, timingSafeEqual } from './crypto.js';

// Validate required JWT secrets at startup
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  const error = new Error(
    'FATAL: JWT secrets not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables.'
  );
  logger.error(error.message);
  throw error;
}

// Validate minimum secret length (256 bits = 32 characters minimum recommended)
const MIN_SECRET_LENGTH = 32;
if (
  ACCESS_TOKEN_SECRET.length < MIN_SECRET_LENGTH ||
  REFRESH_TOKEN_SECRET.length < MIN_SECRET_LENGTH
) {
  logger.warn(`JWT secrets should be at least ${MIN_SECRET_LENGTH} characters for security`);
}

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
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET, {
      issuer: 'rag-backend',
      audience: 'rag-api',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    }
    throw error;
  }
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET, {
      issuer: 'rag-backend',
      audience: 'rag-api',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
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

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

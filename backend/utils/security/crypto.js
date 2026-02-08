/**
 * Crypto Utilities
 *
 * Centralized cryptographic operations to ensure consistency across the codebase.
 * - SHA256 hashing for tokens
 * - Random token generation
 * - Timing-safe comparison
 *
 * @module utils/security/crypto
 */

import crypto from 'crypto';

/**
 * Generate a SHA256 hash of a string
 * @param {string} data - Data to hash
 * @returns {string} Hex-encoded SHA256 hash
 */
export const sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Generate a random hex token
 * @param {number} bytes - Number of random bytes (default 32 = 64 hex chars)
 * @returns {string} Random hex string
 */
export const generateToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Generate a token and its hash for secure storage
 * Useful for reset tokens, verification tokens, etc.
 * @param {number} bytes - Number of random bytes (default 32)
 * @returns {{ rawToken: string, hashedToken: string }} Raw token to send, hashed token to store
 */
export const generateTokenPair = (bytes = 32) => {
  const rawToken = generateToken(bytes);
  const hashedToken = sha256(rawToken);
  return { rawToken, hashedToken };
};

/**
 * Verify a raw token against a stored hash
 * @param {string} rawToken - Raw token from user
 * @param {string} hashedToken - Stored hashed token
 * @returns {boolean} Whether tokens match
 */
export const verifyToken = (rawToken, hashedToken) => {
  const computedHash = sha256(rawToken);
  return timingSafeEqual(computedHash, hashedToken);
};

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} Whether strings are equal
 */
export const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Generate a content hash for deduplication/versioning
 * Normalizes content before hashing (trim + lowercase)
 * @param {string} content - Content to hash
 * @returns {string} SHA256 hash of normalized content
 */
export const contentHash = (content) => {
  if (!content || typeof content !== 'string') {
    return sha256('');
  }
  return sha256(content.trim().toLowerCase());
};

export default {
  sha256,
  generateToken,
  generateTokenPair,
  verifyToken,
  timingSafeEqual,
  contentHash,
};

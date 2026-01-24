import crypto from 'crypto';
import 'dotenv/config';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

// Validate encryption key exists and is correct length
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required');
}

// Convert hex string to buffer (32 bytes for AES-256)
const getKeyBuffer = () => {
  try {
    const buffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (buffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    return buffer;
  } catch (error) {
    throw new Error(`Invalid ENCRYPTION_KEY format: ${error.message}`);
  }
};

/**
 * Encrypt text using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted text in format: iv:authTag:encrypted
 */
export const encrypt = (text) => {
  if (!text) {
    throw new Error('Text to encrypt cannot be empty');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt text encrypted with encrypt()
 * @param {string} encryptedData - Encrypted text in format: iv:authTag:encrypted
 * @returns {string} Decrypted plain text
 */
export const decrypt = (encryptedData) => {
  if (!encryptedData) {
    throw new Error('Encrypted data cannot be empty');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Generate a random 32-byte encryption key in hex format
 * Use this to generate ENCRYPTION_KEY for .env file
 * @returns {string} Random 64-character hex string
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

export default {
  encrypt,
  decrypt,
  generateEncryptionKey,
};

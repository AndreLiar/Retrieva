import crypto from 'crypto';
import 'dotenv/config';

const ALGORITHM = 'aes-256-gcm';

// =============================================================================
// Key Version Management (ISSUE #7: Key Rotation Support)
// =============================================================================
// Current key version - increment this when rotating keys
const CURRENT_KEY_VERSION = parseInt(process.env.ENCRYPTION_KEY_VERSION) || 1;

// Key registry: maps version -> key hex string
// - ENCRYPTION_KEY: Always the current/latest key
// - ENCRYPTION_KEY_V{n}: Historical keys for decryption during migration
const keyRegistry = new Map();

/**
 * Initialize the key registry from environment variables
 * Called once on module load
 */
function initializeKeyRegistry() {
  const currentKey = process.env.ENCRYPTION_KEY;

  if (!currentKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  // Register current key
  keyRegistry.set(CURRENT_KEY_VERSION, currentKey);

  // Register historical keys (for migration/decryption)
  // Check for ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, etc.
  for (let v = 1; v < CURRENT_KEY_VERSION; v++) {
    const oldKey = process.env[`ENCRYPTION_KEY_V${v}`];
    if (oldKey) {
      keyRegistry.set(v, oldKey);
    }
  }

  // Also check if V1 key is explicitly set (for initial rotation from unversioned)
  const v1Key = process.env.ENCRYPTION_KEY_V1;
  if (v1Key && !keyRegistry.has(1)) {
    keyRegistry.set(1, v1Key);
  }
}

// Initialize on module load
initializeKeyRegistry();

/**
 * Convert hex string to buffer (32 bytes for AES-256)
 * @param {string} keyHex - Key in hex format
 * @param {number} version - Key version for error messages
 * @returns {Buffer} Key buffer
 */
function getKeyBuffer(keyHex, version = CURRENT_KEY_VERSION) {
  try {
    const buffer = Buffer.from(keyHex, 'hex');
    if (buffer.length !== 32) {
      throw new Error(`ENCRYPTION_KEY (v${version}) must be 32 bytes (64 hex characters)`);
    }
    return buffer;
  } catch (error) {
    throw new Error(`Invalid ENCRYPTION_KEY (v${version}) format: ${error.message}`);
  }
}

/**
 * Get key buffer for a specific version
 * @param {number} version - Key version
 * @returns {Buffer} Key buffer
 */
function getKeyForVersion(version) {
  const keyHex = keyRegistry.get(version);
  if (!keyHex) {
    throw new Error(
      `Encryption key version ${version} not found. Set ENCRYPTION_KEY_V${version} in environment.`
    );
  }
  return getKeyBuffer(keyHex, version);
}

/**
 * Get current key version
 * @returns {number} Current key version
 */
export const getCurrentKeyVersion = () => CURRENT_KEY_VERSION;

/**
 * Check if key rotation is needed (old version data exists)
 * @param {string} encryptedData - Encrypted data to check
 * @returns {boolean} True if data uses old key version
 */
export const needsKeyRotation = (encryptedData) => {
  if (!encryptedData) return false;
  const version = parseVersion(encryptedData);
  return version < CURRENT_KEY_VERSION;
};

/**
 * Parse version from encrypted data
 * Supports both legacy (v1 implicit) and versioned formats
 *
 * @param {string} encryptedData - Encrypted data
 * @returns {number} Version number
 */
function parseVersion(encryptedData) {
  if (!encryptedData) return 1;

  // Check for versioned format: v{n}:iv:authTag:encrypted
  if (encryptedData.startsWith('v') && encryptedData[1] !== ':') {
    const colonIndex = encryptedData.indexOf(':');
    if (colonIndex > 1) {
      const versionStr = encryptedData.substring(1, colonIndex);
      const version = parseInt(versionStr, 10);
      if (!isNaN(version) && version > 0) {
        return version;
      }
    }
  }

  // Legacy format (v1): iv:authTag:encrypted
  return 1;
}

/**
 * Encrypt text using AES-256-GCM with current key version
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted text in format: v{version}:iv:authTag:encrypted
 */
export const encrypt = (text) => {
  if (!text) {
    throw new Error('Text to encrypt cannot be empty');
  }

  const keyBuffer = getKeyForVersion(CURRENT_KEY_VERSION);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return versioned format: v{version}:iv:authTag:encrypted
  return `v${CURRENT_KEY_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt text encrypted with encrypt()
 * Supports both legacy (v1) and versioned formats
 *
 * @param {string} encryptedData - Encrypted text
 * @returns {string} Decrypted plain text
 */
export const decrypt = (encryptedData) => {
  if (!encryptedData) {
    throw new Error('Encrypted data cannot be empty');
  }

  const version = parseVersion(encryptedData);
  let parts;

  if (version > 1 || encryptedData.startsWith('v1:')) {
    // Versioned format: v{n}:iv:authTag:encrypted
    parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format (versioned)');
    }
    parts = parts.slice(1); // Remove version prefix
  } else {
    // Legacy format: iv:authTag:encrypted
    parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format (legacy)');
    }
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  // Get key for this version
  const keyBuffer = getKeyForVersion(version);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Re-encrypt data with current key version
 * Use during key rotation to upgrade old tokens
 *
 * @param {string} encryptedData - Data encrypted with any version
 * @returns {string} Data re-encrypted with current version
 */
export const rotateEncryption = (encryptedData) => {
  const plaintext = decrypt(encryptedData);
  return encrypt(plaintext);
};

/**
 * Get the version of encrypted data
 * @param {string} encryptedData - Encrypted data
 * @returns {number} Key version used
 */
export const getEncryptionVersion = (encryptedData) => {
  return parseVersion(encryptedData);
};

/**
 * Generate a random 32-byte encryption key in hex format
 * Use this to generate ENCRYPTION_KEY for .env file
 * @returns {string} Random 64-character hex string
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Check if we have keys for all versions up to current
 * @returns {Object} Status of key availability
 */
export const getKeyRotationStatus = () => {
  const status = {
    currentVersion: CURRENT_KEY_VERSION,
    availableVersions: Array.from(keyRegistry.keys()).sort((a, b) => a - b),
    missingVersions: [],
    canDecryptAll: true,
  };

  for (let v = 1; v <= CURRENT_KEY_VERSION; v++) {
    if (!keyRegistry.has(v)) {
      status.missingVersions.push(v);
      status.canDecryptAll = false;
    }
  }

  return status;
};

export default {
  encrypt,
  decrypt,
  generateEncryptionKey,
  rotateEncryption,
  needsKeyRotation,
  getEncryptionVersion,
  getCurrentKeyVersion,
  getKeyRotationStatus,
};

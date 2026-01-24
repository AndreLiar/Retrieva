/**
 * Field-Level Encryption for Mongoose
 *
 * Provides automatic encryption/decryption of sensitive fields in MongoDB documents.
 * Uses AES-256-GCM encryption for data at rest.
 *
 * Features:
 * - Automatic encryption on save
 * - Automatic decryption on find
 * - Supports both string and object fields
 * - Graceful handling of unencrypted legacy data
 *
 * @module utils/fieldEncryption
 */

import { encrypt, decrypt } from './encryption.js';
import logger from '../../config/logger.js';

/**
 * Check if a string looks like encrypted data (iv:authTag:encrypted format)
 *
 * @param {string} value - Value to check
 * @returns {boolean} True if appears to be encrypted
 */
export function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  // Check format: 32 hex chars (iv) : 32 hex chars (authTag) : encrypted data
  return (
    parts.length === 3 &&
    parts[0].length === 32 &&
    parts[1].length === 32 &&
    /^[a-f0-9]+$/i.test(parts[0]) &&
    /^[a-f0-9]+$/i.test(parts[1])
  );
}

/**
 * Safely encrypt a value, handling edge cases
 *
 * @param {string} value - Value to encrypt
 * @returns {string|null} Encrypted value or null
 */
export function safeEncrypt(value) {
  if (!value || typeof value !== 'string') return value;
  if (isEncrypted(value)) return value; // Already encrypted

  try {
    return encrypt(value);
  } catch (error) {
    logger.error('Field encryption failed', {
      service: 'encryption',
      error: error.message,
    });
    throw error;
  }
}

/**
 * Safely decrypt a value, handling legacy unencrypted data
 *
 * @param {string} value - Value to decrypt
 * @returns {string} Decrypted value or original if not encrypted
 */
export function safeDecrypt(value) {
  if (!value || typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value; // Not encrypted (legacy data)

  try {
    return decrypt(value);
  } catch (error) {
    logger.warn('Field decryption failed, returning original value', {
      service: 'encryption',
      error: error.message,
    });
    // Return original value if decryption fails (could be legacy data)
    return value;
  }
}

/**
 * Encrypt an object's specified fields
 *
 * @param {Object} obj - Object containing fields to encrypt
 * @param {string[]} fields - Array of field paths to encrypt
 * @returns {Object} Object with encrypted fields
 */
export function encryptFields(obj, fields) {
  if (!obj) return obj;

  const result = { ...obj };

  for (const field of fields) {
    const value = getNestedValue(result, field);
    if (value !== undefined && value !== null) {
      setNestedValue(result, field, safeEncrypt(String(value)));
    }
  }

  return result;
}

/**
 * Decrypt an object's specified fields
 *
 * @param {Object} obj - Object containing encrypted fields
 * @param {string[]} fields - Array of field paths to decrypt
 * @returns {Object} Object with decrypted fields
 */
export function decryptFields(obj, fields) {
  if (!obj) return obj;

  const result = { ...obj };

  for (const field of fields) {
    const value = getNestedValue(result, field);
    if (value !== undefined && value !== null) {
      setNestedValue(result, field, safeDecrypt(value));
    }
  }

  return result;
}

/**
 * Get nested value from object using dot notation
 *
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot-notation path (e.g., 'user.email')
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Set nested value in object using dot notation
 *
 * @param {Object} obj - Object to set value in
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Create a Mongoose plugin for automatic field encryption
 *
 * @param {string[]} encryptedFields - Array of field names to encrypt
 * @returns {Function} Mongoose plugin function
 *
 * @example
 * const messageSchema = new mongoose.Schema({ content: String });
 * messageSchema.plugin(createEncryptionPlugin(['content']));
 */
export function createEncryptionPlugin(encryptedFields) {
  return function encryptionPlugin(schema) {
    // Encrypt fields before saving (Mongoose 9.x compatible - async/await)
    schema.pre('save', async function () {
      for (const field of encryptedFields) {
        const value = this.get(field);
        if (value && typeof value === 'string' && !isEncrypted(value)) {
          this.set(field, encrypt(value));
        }
      }
    });

    // Encrypt on update operations (Mongoose 9.x compatible - async/await)
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], async function () {
      const update = this.getUpdate();
      if (!update) return;

      // Handle $set operations
      if (update.$set) {
        for (const field of encryptedFields) {
          if (update.$set[field] && !isEncrypted(update.$set[field])) {
            update.$set[field] = encrypt(update.$set[field]);
          }
        }
      }

      // Handle direct field updates
      for (const field of encryptedFields) {
        if (update[field] && !isEncrypted(update[field])) {
          update[field] = encrypt(update[field]);
        }
      }
    });

    // Decrypt fields after finding
    schema.post(['find', 'findOne', 'findById'], function (docs) {
      if (!docs) return;

      const decryptDoc = (doc) => {
        if (!doc) return;
        for (const field of encryptedFields) {
          const value = doc[field];
          if (value && isEncrypted(value)) {
            try {
              doc[field] = decrypt(value);
            } catch (error) {
              logger.warn('Failed to decrypt field', {
                service: 'encryption',
                field,
                error: error.message,
              });
            }
          }
        }
      };

      if (Array.isArray(docs)) {
        docs.forEach(decryptDoc);
      } else {
        decryptDoc(docs);
      }
    });

    // Add instance method for manual encryption
    schema.methods.encryptField = function (field) {
      const value = this.get(field);
      if (value && !isEncrypted(value)) {
        this.set(field, encrypt(value));
      }
      return this;
    };

    // Add instance method for manual decryption
    schema.methods.decryptField = function (field) {
      const value = this.get(field);
      if (value && isEncrypted(value)) {
        return decrypt(value);
      }
      return value;
    };

    // Add static method to get decrypted document
    schema.statics.findDecrypted = async function (query) {
      const doc = await this.findOne(query).lean();
      if (doc) {
        return decryptFields(doc, encryptedFields);
      }
      return null;
    };
  };
}

/**
 * Encryption middleware for Express routes
 * Automatically decrypts specified response fields
 *
 * @param {string[]} fields - Fields to decrypt in response
 * @returns {Function} Express middleware
 */
export function decryptResponseMiddleware(fields) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      if (data && typeof data === 'object') {
        if (data.data) {
          data.data = decryptFields(data.data, fields);
        } else {
          data = decryptFields(data, fields);
        }
      }
      return originalJson(data);
    };

    next();
  };
}

export default {
  isEncrypted,
  safeEncrypt,
  safeDecrypt,
  encryptFields,
  decryptFields,
  createEncryptionPlugin,
  decryptResponseMiddleware,
};

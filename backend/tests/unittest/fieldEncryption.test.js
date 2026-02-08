/**
 * Field Encryption Unit Tests
 *
 * Tests for Mongoose field-level encryption utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isEncrypted,
  safeEncrypt,
  safeDecrypt,
  encryptFields,
  decryptFields,
} from '../../utils/security/fieldEncryption.js';
import { encrypt } from '../../utils/security/encryption.js';

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Field Encryption Utilities', () => {
  describe('isEncrypted', () => {
    it('should return true for valid encrypted format', () => {
      const encrypted = encrypt('test');

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('plain text')).toBe(false);
      expect(isEncrypted('Hello World')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted(123)).toBe(false);
      expect(isEncrypted({})).toBe(false);
    });

    it('should return false for strings with wrong format', () => {
      expect(isEncrypted('a:b')).toBe(false);
      expect(isEncrypted('a:b:c:d')).toBe(false);
      expect(isEncrypted('short:short:data')).toBe(false);
    });

    it('should return false for strings with non-hex characters', () => {
      const fakeEncrypted = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:gggggggggggggggggggggggggggggggg:data';
      expect(isEncrypted(fakeEncrypted)).toBe(false);
    });
  });

  describe('safeEncrypt', () => {
    it('should encrypt plain text', () => {
      const result = safeEncrypt('secret');

      expect(result).not.toBe('secret');
      expect(isEncrypted(result)).toBe(true);
    });

    it('should return already encrypted data unchanged', () => {
      const encrypted = encrypt('test');
      const result = safeEncrypt(encrypted);

      expect(result).toBe(encrypted);
    });

    it('should return non-string values unchanged', () => {
      expect(safeEncrypt(null)).toBe(null);
      expect(safeEncrypt(undefined)).toBe(undefined);
      expect(safeEncrypt('')).toBe('');
    });
  });

  describe('safeDecrypt', () => {
    it('should decrypt encrypted text', () => {
      const encrypted = encrypt('secret');
      const result = safeDecrypt(encrypted);

      expect(result).toBe('secret');
    });

    it('should return plain text unchanged (legacy data)', () => {
      const plainText = 'not encrypted';
      const result = safeDecrypt(plainText);

      expect(result).toBe(plainText);
    });

    it('should return non-string values unchanged', () => {
      expect(safeDecrypt(null)).toBe(null);
      expect(safeDecrypt(undefined)).toBe(undefined);
      expect(safeDecrypt('')).toBe('');
    });
  });

  describe('encryptFields', () => {
    it('should encrypt specified fields', () => {
      const obj = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'secret123',
      };

      const result = encryptFields(obj, ['name', 'password']);

      expect(result.email).toBe('john@example.com'); // not encrypted
      expect(isEncrypted(result.name)).toBe(true);
      expect(isEncrypted(result.password)).toBe(true);
    });

    it('should handle null object', () => {
      expect(encryptFields(null, ['field'])).toBe(null);
    });

    it('should handle undefined fields', () => {
      const obj = { name: 'John' };
      const result = encryptFields(obj, ['nonexistent']);

      expect(result.name).toBe('John');
    });

    it('should not double-encrypt already encrypted fields', () => {
      const encrypted = encrypt('secret');
      const obj = { field: encrypted };
      const result = encryptFields(obj, ['field']);

      expect(result.field).toBe(encrypted);
    });
  });

  describe('decryptFields', () => {
    it('should decrypt specified fields', () => {
      const encrypted = encrypt('John Doe');
      const obj = {
        name: encrypted,
        email: 'john@example.com',
      };

      const result = decryptFields(obj, ['name']);

      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should handle null object', () => {
      expect(decryptFields(null, ['field'])).toBe(null);
    });

    it('should leave plain text fields unchanged', () => {
      const obj = { name: 'John Doe' };
      const result = decryptFields(obj, ['name']);

      expect(result.name).toBe('John Doe');
    });
  });

  describe('roundtrip encryption', () => {
    it('should encrypt and decrypt fields correctly', () => {
      const original = {
        name: 'John Doe',
        ssn: '123-45-6789',
        public: 'visible',
      };

      const encrypted = encryptFields(original, ['name', 'ssn']);
      const decrypted = decryptFields(encrypted, ['name', 'ssn']);

      expect(decrypted.name).toBe('John Doe');
      expect(decrypted.ssn).toBe('123-45-6789');
      expect(decrypted.public).toBe('visible');
    });
  });
});

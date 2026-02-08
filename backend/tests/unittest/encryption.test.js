/**
 * Encryption Utility Unit Tests
 *
 * Tests for AES-256-GCM encryption/decryption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encrypt, decrypt, generateEncryptionKey } from '../../utils/security/encryption.js';

describe('Encryption Utilities', () => {
  describe('generateEncryptionKey', () => {
    it('should generate 64 character hex string (32 bytes)', () => {
      const key = generateEncryptionKey();

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique keys each time', () => {
      const keys = new Set();

      for (let i = 0; i < 100; i++) {
        keys.add(generateEncryptionKey());
      }

      expect(keys.size).toBe(100);
    });
  });

  describe('encrypt', () => {
    it('should encrypt text to format iv:authTag:encrypted', () => {
      const encrypted = encrypt('test message');
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(32); // 16 bytes IV = 32 hex chars
      expect(parts[1]).toHaveLength(32); // 16 bytes auth tag = 32 hex chars
      expect(parts[2].length).toBeGreaterThan(0); // encrypted data
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'test message';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'こんにちは 👋 émojis';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeTruthy();
    });

    it('should throw error for empty text', () => {
      expect(() => encrypt('')).toThrow('Text to encrypt cannot be empty');
    });

    it('should throw error for null/undefined', () => {
      expect(() => encrypt(null)).toThrow();
      expect(() => encrypt(undefined)).toThrow();
    });
  });

  describe('decrypt', () => {
    it('should decrypt back to original plaintext', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'こんにちは 👋 émojis';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'test'.repeat(1000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid format', () => {
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('')).toThrow('Encrypted data cannot be empty');
    });

    it('should throw error for tampered data', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      // Tamper with the encrypted data
      parts[2] = 'tampered' + parts[2].slice(8);
      const tampered = parts.join(':');

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    const testCases = [
      'simple text',
      'with numbers 123456',
      'with special chars !@#$%^&*()',
      'with\nnewlines\nand\ttabs',
      'unicode: 日本語 한국어 中文',
      'emojis: 🎉🚀✨💯',
      '   leading and trailing spaces   ',
      'mixed: Hello! 你好 🌍 @2024',
    ];

    testCases.forEach((plaintext) => {
      it(`should roundtrip: "${plaintext.slice(0, 30)}..."`, () => {
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
      });
    });
  });
});

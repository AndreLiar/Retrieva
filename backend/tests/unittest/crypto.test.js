/**
 * Crypto Utilities Unit Tests
 *
 * Tests for centralized cryptographic operations
 */

import { describe, it, expect } from 'vitest';
import {
  sha256,
  generateToken,
  generateTokenPair,
  verifyToken,
  timingSafeEqual,
  contentHash,
} from '../../utils/security/crypto.js';

describe('Crypto Utilities', () => {
  describe('sha256', () => {
    it('should generate consistent hash for same input', () => {
      const input = 'test-string';
      const hash1 = sha256(input);
      const hash2 = sha256(input);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = sha256('input1');
      const hash2 = sha256('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character hex string', () => {
      const hash = sha256('test');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should handle empty string', () => {
      const hash = sha256('');

      expect(hash).toHaveLength(64);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode characters', () => {
      const hash = sha256('こんにちは');

      expect(hash).toHaveLength(64);
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000);
      const hash = sha256(longString);

      expect(hash).toHaveLength(64);
    });
  });

  describe('generateToken', () => {
    it('should generate 64 character hex string by default (32 bytes)', () => {
      const token = generateToken();

      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate token with specified byte length', () => {
      const token16 = generateToken(16);
      const token64 = generateToken(64);

      expect(token16).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(token64).toHaveLength(128); // 64 bytes = 128 hex chars
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set();

      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }

      expect(tokens.size).toBe(100);
    });

    it('should handle small byte sizes', () => {
      const token = generateToken(1);

      expect(token).toHaveLength(2);
    });
  });

  describe('generateTokenPair', () => {
    it('should return rawToken and hashedToken', () => {
      const { rawToken, hashedToken } = generateTokenPair();

      expect(rawToken).toBeDefined();
      expect(hashedToken).toBeDefined();
      expect(rawToken).not.toBe(hashedToken);
    });

    it('should generate hashedToken from rawToken', () => {
      const { rawToken, hashedToken } = generateTokenPair();
      const rehashedToken = sha256(rawToken);

      expect(hashedToken).toBe(rehashedToken);
    });

    it('should generate unique pairs each time', () => {
      const pair1 = generateTokenPair();
      const pair2 = generateTokenPair();

      expect(pair1.rawToken).not.toBe(pair2.rawToken);
      expect(pair1.hashedToken).not.toBe(pair2.hashedToken);
    });

    it('should respect byte size parameter', () => {
      const { rawToken } = generateTokenPair(16);

      expect(rawToken).toHaveLength(32);
    });
  });

  describe('verifyToken', () => {
    it('should return true for matching token and hash', () => {
      const { rawToken, hashedToken } = generateTokenPair();

      expect(verifyToken(rawToken, hashedToken)).toBe(true);
    });

    it('should return false for non-matching token', () => {
      const { hashedToken } = generateTokenPair();
      const wrongToken = generateToken();

      expect(verifyToken(wrongToken, hashedToken)).toBe(false);
    });

    it('should return false for non-matching hash', () => {
      const { rawToken } = generateTokenPair();
      const wrongHash = sha256('wrong');

      expect(verifyToken(rawToken, wrongHash)).toBe(false);
    });

    it('should return false for empty inputs', () => {
      // verifyToken hashes the rawToken and compares to hashedToken
      // sha256('') != '', so this returns false
      expect(verifyToken('', '')).toBe(false);
      expect(verifyToken('token', '')).toBe(false);
      expect(verifyToken('', 'hash')).toBe(false);
    });

    it('should match empty token with its hash', () => {
      // To match empty string, need the hash of empty string
      const emptyHash = sha256('');
      expect(verifyToken('', emptyHash)).toBe(true);
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for equal strings', () => {
      expect(timingSafeEqual('test', 'test')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(timingSafeEqual('test1', 'test2')).toBe(false);
      expect(timingSafeEqual('short', 'longer')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(timingSafeEqual(null, 'test')).toBe(false);
      expect(timingSafeEqual('test', null)).toBe(false);
      expect(timingSafeEqual(123, 'test')).toBe(false);
      expect(timingSafeEqual(undefined, undefined)).toBe(false);
    });

    it('should handle long strings', () => {
      const long1 = 'a'.repeat(1000);
      const long2 = 'a'.repeat(1000);
      const long3 = 'a'.repeat(999) + 'b';

      expect(timingSafeEqual(long1, long2)).toBe(true);
      expect(timingSafeEqual(long1, long3)).toBe(false);
    });
  });

  describe('contentHash', () => {
    it('should normalize content before hashing (trim + lowercase)', () => {
      const hash1 = contentHash('  Hello World  ');
      const hash2 = contentHash('hello world');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = contentHash('content one');
      const hash2 = contentHash('content two');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = contentHash('');

      expect(hash).toHaveLength(64);
    });

    it('should handle null and undefined', () => {
      const hashNull = contentHash(null);
      const hashUndefined = contentHash(undefined);
      const hashEmpty = contentHash('');

      expect(hashNull).toBe(hashEmpty);
      expect(hashUndefined).toBe(hashEmpty);
    });

    it('should handle non-string inputs', () => {
      const hashNumber = contentHash(123);
      const hashEmpty = contentHash('');

      expect(hashNumber).toBe(hashEmpty);
    });

    it('should be consistent for same normalized content', () => {
      const inputs = ['  TEST  ', 'test', 'TEST', '  test  ', '\tTEST\n'];

      const hashes = inputs.map(contentHash);
      const uniqueHashes = new Set(hashes);

      expect(uniqueHashes.size).toBe(1);
    });
  });
});

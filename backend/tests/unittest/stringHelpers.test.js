/**
 * String Helpers Unit Tests
 *
 * Tests for string manipulation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  truncate,
  capitalize,
  slugify,
  extractKeywords,
  sanitizeFilename,
  generateRandomString,
} from '../../utils/core/stringHelpers.js';

describe('String Helpers', () => {
  describe('truncate', () => {
    it('should truncate long strings', () => {
      const result = truncate('This is a very long string that needs truncation', 20);

      expect(result).toBe('This is a very lo...');
      expect(result.length).toBe(20);
    });

    it('should not truncate short strings', () => {
      const result = truncate('Short', 20);

      expect(result).toBe('Short');
    });

    it('should handle exact length strings', () => {
      const result = truncate('Exactly twenty char', 20);

      expect(result).toBe('Exactly twenty char');
    });

    it('should use custom suffix', () => {
      const result = truncate('This is a long string', 15, '…');

      expect(result).toBe('This is a long…');
    });

    it('should handle empty string', () => {
      const result = truncate('', 10);

      expect(result).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(truncate(null, 10)).toBe(null);
      expect(truncate(undefined, 10)).toBe(undefined);
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle already capitalized', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    it('should handle single character', () => {
      expect(capitalize('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle numbers at start', () => {
      expect(capitalize('123abc')).toBe('123abc');
    });

    it('should lowercase rest of string', () => {
      // capitalize() lowercases the rest of the string
      expect(capitalize('hELLO wORLD')).toBe('Hello world');
    });
  });

  describe('slugify', () => {
    it('should convert to lowercase slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello! World?')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    it('should handle leading/trailing spaces', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('should handle accented characters', () => {
      const result = slugify('Café résumé');
      // Should handle or remove accents
      expect(result).not.toContain(' ');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should handle numbers', () => {
      expect(slugify('Hello 123 World')).toBe('hello-123-world');
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from text', () => {
      const result = extractKeywords('The quick brown fox jumps over the lazy dog');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should remove common stop words and short words', () => {
      // extractKeywords filters words with length <= 3
      const result = extractKeywords('The quick brown fox');

      expect(result).not.toContain('the');
      expect(result).not.toContain('fox'); // 3 chars, filtered out
      expect(result).toContain('quick');
      expect(result).toContain('brown');
    });

    it('should handle empty string', () => {
      const result = extractKeywords('');

      expect(result).toEqual([]);
    });

    it('should handle single word longer than 3 chars', () => {
      const result = extractKeywords('Hello');

      expect(result).toContain('hello');
    });

    it('should filter out words with 3 or fewer chars', () => {
      const result = extractKeywords('cat dog bat');

      expect(result).toEqual([]); // All words are 3 chars
    });

    it('should limit number of keywords', () => {
      const longText = 'one two three four five six seven eight nine ten eleven twelve';
      const result = extractKeywords(longText, 5);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove dangerous characters', () => {
      const result = sanitizeFilename('file/name\\with:bad*chars?.txt');

      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).not.toContain(':');
      expect(result).not.toContain('*');
      expect(result).not.toContain('?');
    });

    it('should preserve valid characters', () => {
      const result = sanitizeFilename('valid-file_name.txt');

      expect(result).toBe('valid-file_name.txt');
    });

    it('should handle spaces', () => {
      const result = sanitizeFilename('file with spaces.txt');

      expect(result).toContain('file');
      expect(result).toContain('spaces');
    });

    it('should handle empty string', () => {
      const result = sanitizeFilename('');

      expect(result).toBe('');
    });

    it('should handle dots', () => {
      const result = sanitizeFilename('..hidden.txt');

      // sanitizeFilename preserves dots but removes other special chars
      expect(result).toBe('..hidden.txt');
    });
  });

  describe('generateRandomString', () => {
    it('should generate string of specified length', () => {
      const result = generateRandomString(16);

      expect(result.length).toBe(16);
    });

    it('should generate different strings each time', () => {
      const results = new Set();

      for (let i = 0; i < 100; i++) {
        results.add(generateRandomString(16));
      }

      expect(results.size).toBe(100);
    });

    it('should only contain alphanumeric characters', () => {
      const result = generateRandomString(100);

      expect(result).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should handle length of 1', () => {
      const result = generateRandomString(1);

      expect(result.length).toBe(1);
    });

    it('should handle length of 0', () => {
      const result = generateRandomString(0);

      expect(result).toBe('');
    });
  });
});

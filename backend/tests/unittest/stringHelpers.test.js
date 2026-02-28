/**
 * String Helpers Unit Tests
 *
 * Tests for string manipulation utilities
 */

import { describe, it, expect } from 'vitest';
import { truncate, capitalize, slugify } from '../../utils/core/stringHelpers.js';

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
});

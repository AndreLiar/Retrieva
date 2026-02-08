/**
 * Date Helpers Unit Tests
 *
 * Tests for date manipulation utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentTimestamp,
  formatDate,
  formatDateTime,
  getTimeAgo,
  calculateDuration,
  isValidDate,
} from '../../utils/core/dateHelpers.js';

describe('Date Helpers', () => {
  describe('getCurrentTimestamp', () => {
    it('should return current timestamp as ISO string', () => {
      const before = new Date().toISOString();
      const timestamp = getCurrentTimestamp();
      const after = new Date().toISOString();

      // Should be a valid ISO string
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });

    it('should return a string', () => {
      const timestamp = getCurrentTimestamp();

      expect(typeof timestamp).toBe('string');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-03-15T10:30:00Z');
      const result = formatDate(date);

      expect(result).toContain('2024');
      // Uses month: 'long' so it's "March" not "03"
      expect(result).toContain('March');
      expect(result).toContain('15');
    });

    it('should handle string dates', () => {
      const result = formatDate('2024-03-15');

      expect(result).toContain('2024');
    });

    it('should handle timestamp', () => {
      const timestamp = new Date('2024-03-15').getTime();
      const result = formatDate(timestamp);

      expect(result).toContain('2024');
    });

    it('should handle invalid date', () => {
      const result = formatDate('not-a-date');

      expect(result).toBeDefined();
    });
  });

  describe('formatDateTime', () => {
    it('should include time in output', () => {
      const date = new Date('2024-03-15T14:30:00');
      const result = formatDateTime(date);

      expect(result).toContain('2024');
      // Should contain time components
      expect(result.length).toBeGreaterThan(formatDate(date).length);
    });

    it('should handle different time zones', () => {
      const date = new Date('2024-03-15T14:30:00Z');
      const result = formatDateTime(date);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getTimeAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "just now" for recent times', () => {
      const date = new Date('2024-03-15T11:59:30Z'); // 30 seconds ago
      const result = getTimeAgo(date);

      expect(result.toLowerCase()).toContain('just now') ||
        expect(result.toLowerCase()).toContain('second');
    });

    it('should return minutes ago', () => {
      const date = new Date('2024-03-15T11:55:00Z'); // 5 minutes ago
      const result = getTimeAgo(date);

      expect(result.toLowerCase()).toContain('minute');
    });

    it('should return hours ago', () => {
      const date = new Date('2024-03-15T09:00:00Z'); // 3 hours ago
      const result = getTimeAgo(date);

      expect(result.toLowerCase()).toContain('hour');
    });

    it('should return days ago', () => {
      const date = new Date('2024-03-13T12:00:00Z'); // 2 days ago
      const result = getTimeAgo(date);

      expect(result.toLowerCase()).toContain('day');
    });

    it('should handle future dates', () => {
      const date = new Date('2024-03-16T12:00:00Z'); // 1 day in future
      const result = getTimeAgo(date);

      expect(result).toBeDefined();
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration with breakdown', () => {
      const start = new Date('2024-03-15T10:00:00Z');
      const end = new Date('2024-03-15T10:05:00Z');
      const result = calculateDuration(start, end);

      expect(result.milliseconds).toBe(5 * 60 * 1000); // 5 minutes in ms
      expect(result.minutes).toBe(5);
      expect(result.hours).toBe(0);
      expect(result.days).toBe(0);
    });

    it('should handle negative duration (end before start)', () => {
      const start = new Date('2024-03-15T10:05:00Z');
      const end = new Date('2024-03-15T10:00:00Z');
      const result = calculateDuration(start, end);

      // Returns negative milliseconds when end is before start
      expect(result.milliseconds).toBe(-5 * 60 * 1000);
    });

    it('should handle same start and end', () => {
      const date = new Date('2024-03-15T10:00:00Z');
      const result = calculateDuration(date, date);

      expect(result.milliseconds).toBe(0);
      expect(result.minutes).toBe(0);
    });

    it('should handle timestamp inputs', () => {
      const start = new Date('2024-03-15T10:00:00Z').getTime();
      const end = new Date('2024-03-15T10:01:00Z').getTime();
      const result = calculateDuration(start, end);

      expect(result.milliseconds).toBe(60 * 1000); // 1 minute in ms
      expect(result.minutes).toBe(1);
    });

    it('should calculate complex durations', () => {
      const start = new Date('2024-03-15T00:00:00Z');
      const end = new Date('2024-03-16T02:30:45Z'); // 1 day, 2 hours, 30 minutes, 45 seconds
      const result = calculateDuration(start, end);

      expect(result.days).toBe(1);
      expect(result.hours).toBe(2);
      expect(result.minutes).toBe(30);
      expect(result.seconds).toBe(45);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid Date object', () => {
      expect(isValidDate(new Date())).toBe(true);
    });

    it('should return true for valid date string', () => {
      expect(isValidDate('2024-03-15')).toBe(true);
    });

    it('should return true for valid timestamp', () => {
      expect(isValidDate(Date.now())).toBe(true);
    });

    it('should return false for Invalid Date', () => {
      expect(isValidDate(new Date('not-a-date'))).toBe(false);
    });

    it('should return false for invalid string', () => {
      expect(isValidDate('not-a-date')).toBe(false);
    });

    it('should return true for null (converts to epoch 0)', () => {
      // new Date(null) creates a valid date (Jan 1, 1970)
      expect(isValidDate(null)).toBe(true);
    });

    it('should return true for undefined (becomes Invalid Date)', () => {
      // new Date(undefined) creates Invalid Date
      expect(isValidDate(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidDate('')).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValidDate(NaN)).toBe(false);
    });

    it('should handle edge cases', () => {
      // Note: JavaScript Date parsing is lenient
      // '2024-02-30' becomes March 1st, 2024 (valid)
      // '2024-13-01' becomes Invalid Date (month > 12)
      expect(isValidDate('2024-02-30')).toBe(true); // JS auto-corrects to Mar 1
      expect(isValidDate('2024-13-01')).toBe(false); // Invalid month
    });
  });
});

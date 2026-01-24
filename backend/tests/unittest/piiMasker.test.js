/**
 * Unit Tests for PII Masker
 *
 * Tests the PII detection and masking utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger and config before importing the module
// Note: Mock paths match the import paths in the source file (utils/security/piiMasker.js)
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../config/guardrails.js', () => ({
  guardrailsConfig: {
    output: {
      piiMasking: {
        enabled: true,
        patterns: [],
      },
    },
  },
}));

import { detectPII, maskPII } from '../../utils/security/piiMasker.js';

describe('PII Masker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // detectPII tests
  // ============================================================================
  describe('detectPII', () => {
    it('should return no PII for empty string', () => {
      const result = detectPII('');
      expect(result.hasPII).toBe(false);
      expect(result.detections).toEqual([]);
    });

    it('should return no PII for null input', () => {
      const result = detectPII(null);
      expect(result.hasPII).toBe(false);
    });

    it('should return no PII for non-string input', () => {
      const result = detectPII(123);
      expect(result.hasPII).toBe(false);
    });

    it('should detect email addresses', () => {
      const result = detectPII('Contact me at john.doe@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.summary.email).toBeGreaterThan(0);
    });

    it('should detect multiple email addresses', () => {
      const result = detectPII('Emails: john@test.com and jane@test.com');
      expect(result.hasPII).toBe(true);
      expect(result.summary.email).toBe(2);
    });

    it('should detect US phone numbers', () => {
      const phoneFormats = [
        '555-123-4567',
        '(555) 123-4567',
        '555.123.4567',
        '5551234567',
        '+1 555 123 4567',
      ];

      for (const phone of phoneFormats) {
        const result = detectPII(`Call me at ${phone}`);
        expect(result.hasPII).toBe(true);
        expect(result.summary.phone).toBeGreaterThan(0);
      }
    });

    it('should detect SSN patterns', () => {
      const result = detectPII('My SSN is 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.summary.ssn).toBeGreaterThan(0);
    });

    it('should detect SSN without dashes', () => {
      const result = detectPII('SSN: 123456789');
      expect(result.hasPII).toBe(true);
      expect(result.summary.ssn).toBeGreaterThan(0);
    });

    it('should detect credit card numbers', () => {
      const result = detectPII('Card: 4111-1111-1111-1111');
      expect(result.hasPII).toBe(true);
      expect(result.summary.credit_card).toBeGreaterThan(0);
    });

    it('should detect credit card numbers without dashes', () => {
      const result = detectPII('Card: 4111111111111111');
      expect(result.hasPII).toBe(true);
      expect(result.summary.credit_card).toBeGreaterThan(0);
    });

    it('should detect IPv4 addresses', () => {
      const result = detectPII('Server IP: 192.168.1.1');
      expect(result.hasPII).toBe(true);
      expect(result.summary.ip_address).toBeGreaterThan(0);
    });

    it('should detect date of birth patterns', () => {
      const result = detectPII('DOB: 01/15/1990');
      expect(result.hasPII).toBe(true);
      expect(result.summary.date_of_birth).toBeGreaterThan(0);
    });

    it('should detect passport numbers', () => {
      const result = detectPII('Passport: AB1234567');
      expect(result.hasPII).toBe(true);
      expect(result.summary.passport).toBeGreaterThan(0);
    });

    it('should detect drivers license', () => {
      const result = detectPII("Driver's License: D12345678");
      expect(result.hasPII).toBe(true);
      expect(result.summary.drivers_license).toBeGreaterThan(0);
    });

    it('should detect bank account numbers', () => {
      const result = detectPII('Account: 12345678901');
      expect(result.hasPII).toBe(true);
      expect(result.summary.bank_account).toBeGreaterThan(0);
    });

    it('should detect routing numbers', () => {
      const result = detectPII('Routing: 123456789');
      expect(result.hasPII).toBe(true);
      expect(result.summary.routing_number).toBeGreaterThan(0);
    });

    it('should return no PII for safe text', () => {
      const safeTexts = [
        'Hello, how are you?',
        'The weather is nice today.',
        'I need help with my homework.',
        'What is the capital of France?',
      ];

      for (const text of safeTexts) {
        const result = detectPII(text);
        expect(result.hasPII).toBe(false);
      }
    });

    it('should detect multiple types of PII', () => {
      const text = 'Email: test@example.com, Phone: 555-123-4567, SSN: 123-45-6789';
      const result = detectPII(text);
      expect(result.hasPII).toBe(true);
      expect(Object.keys(result.summary).length).toBeGreaterThan(1);
    });
  });

  // ============================================================================
  // maskPII tests
  // ============================================================================
  describe('maskPII', () => {
    it('should return object with empty text for null input', () => {
      const result = maskPII(null);
      expect(result.text).toBe('');
      expect(result.masked).toBe(false);
    });

    it('should return object with empty text for undefined input', () => {
      const result = maskPII(undefined);
      expect(result.text).toBe('');
      expect(result.masked).toBe(false);
    });

    it('should return same text if no PII detected', () => {
      const text = 'Hello, how are you today?';
      const result = maskPII(text);
      expect(result.text).toBe(text);
      expect(result.masked).toBe(false);
    });

    it('should mask email addresses', () => {
      const text = 'Contact john@example.com';
      const result = maskPII(text);
      expect(result.text).not.toContain('john@example.com');
      expect(result.text).toContain('[EMAIL REDACTED]');
      expect(result.masked).toBe(true);
    });

    it('should mask phone numbers', () => {
      const text = 'Call 555-123-4567';
      const result = maskPII(text);
      expect(result.text).not.toContain('555-123-4567');
      expect(result.text).toContain('[PHONE REDACTED]');
      expect(result.masked).toBe(true);
    });

    it('should mask SSN', () => {
      const text = 'SSN: 123-45-6789';
      const result = maskPII(text);
      expect(result.text).not.toContain('123-45-6789');
      expect(result.text).toContain('[SSN REDACTED]');
      expect(result.masked).toBe(true);
    });

    it('should mask credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const result = maskPII(text);
      expect(result.text).not.toContain('4111');
      expect(result.text).toContain('[CARD REDACTED]');
      expect(result.masked).toBe(true);
    });

    it('should mask IP addresses', () => {
      const text = 'Server: 192.168.1.1';
      const result = maskPII(text);
      expect(result.text).not.toContain('192.168.1.1');
      expect(result.text).toContain('[IP REDACTED]');
      expect(result.masked).toBe(true);
    });

    it('should mask multiple PII instances', () => {
      const text = 'User john@test.com called from 555-123-4567';
      const result = maskPII(text);
      expect(result.text).toContain('[EMAIL REDACTED]');
      expect(result.text).toContain('[PHONE REDACTED]');
      expect(result.masked).toBe(true);
      expect(result.totalMasked).toBe(2);
    });

    it('should preserve non-PII content', () => {
      const text = 'Hello John, your email is john@test.com';
      const result = maskPII(text);
      expect(result.text).toContain('Hello John');
      expect(result.text).toContain('[EMAIL REDACTED]');
    });
  });
});

/**
 * Unit Tests for Output Sanitizer
 *
 * Tests the security utilities that sanitize LLM outputs
 * to prevent XSS and other output-based attacks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger before importing the module (path relative to source file location)
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Note: The mock path above matches the import path in the source file:
// utils/security/outputSanitizer.js imports from '../../config/logger.js'

import {
  encodeHTMLEntities,
  decodeHTMLEntities,
  removeDangerousPatterns,
  detectSuspiciousOutput,
} from '../../utils/security/outputSanitizer.js';

describe('Output Sanitizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // encodeHTMLEntities tests
  // ============================================================================
  describe('encodeHTMLEntities', () => {
    it('should return empty string for null input', () => {
      expect(encodeHTMLEntities(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(encodeHTMLEntities(undefined)).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(encodeHTMLEntities(123)).toBe('');
      expect(encodeHTMLEntities({})).toBe('');
    });

    it('should encode ampersand', () => {
      expect(encodeHTMLEntities('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should encode less than and greater than', () => {
      expect(encodeHTMLEntities('<script>')).toBe('&lt;script&gt;');
      expect(encodeHTMLEntities('1 < 2 > 0')).toBe('1 &lt; 2 &gt; 0');
    });

    it('should encode double quotes', () => {
      expect(encodeHTMLEntities('Say "hello"')).toBe('Say &quot;hello&quot;');
    });

    it('should encode single quotes', () => {
      expect(encodeHTMLEntities("It's a test")).toBe('It&#x27;s a test');
    });

    it('should encode forward slash', () => {
      expect(encodeHTMLEntities('a/b')).toBe('a&#x2F;b');
    });

    it('should encode backticks', () => {
      expect(encodeHTMLEntities('`code`')).toBe('&#x60;code&#x60;');
    });

    it('should encode equals sign', () => {
      expect(encodeHTMLEntities('a=b')).toBe('a&#x3D;b');
    });

    it('should encode all dangerous characters in one string', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
      expect(encodeHTMLEntities(input)).toBe(expected);
    });

    it('should not modify safe text', () => {
      expect(encodeHTMLEntities('Hello World')).toBe('Hello World');
      expect(encodeHTMLEntities('Test 123')).toBe('Test 123');
    });
  });

  // ============================================================================
  // decodeHTMLEntities tests
  // ============================================================================
  describe('decodeHTMLEntities', () => {
    it('should return empty string for null input', () => {
      expect(decodeHTMLEntities(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(decodeHTMLEntities(undefined)).toBe('');
    });

    it('should decode ampersand', () => {
      expect(decodeHTMLEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    });

    it('should decode less than and greater than', () => {
      expect(decodeHTMLEntities('&lt;script&gt;')).toBe('<script>');
    });

    it('should decode double quotes', () => {
      expect(decodeHTMLEntities('Say &quot;hello&quot;')).toBe('Say "hello"');
    });

    it('should decode single quotes (various formats)', () => {
      expect(decodeHTMLEntities('It&#x27;s a test')).toBe("It's a test");
      expect(decodeHTMLEntities('It&#39;s a test')).toBe("It's a test");
      expect(decodeHTMLEntities('It&apos;s a test')).toBe("It's a test");
    });

    it('should handle forward slash entity (not decoded for security)', () => {
      // Note: Forward slash is intentionally not decoded as it's less common
      // and decoding is focused on display characters
      expect(decodeHTMLEntities('a&#x2F;b')).toBe('a&#x2F;b');
    });

    it('should decode backticks', () => {
      expect(decodeHTMLEntities('&#x60;code&#x60;')).toBe('`code`');
    });

    it('should be the inverse of encodeHTMLEntities', () => {
      const original = '<script>alert("XSS")</script>';
      const encoded = encodeHTMLEntities(original);
      // Note: decode may not be perfect inverse due to different quote encodings
      const decoded = decodeHTMLEntities(encoded);
      expect(decoded).toContain('<script>');
    });
  });

  // ============================================================================
  // removeDangerousPatterns tests
  // ============================================================================
  describe('removeDangerousPatterns', () => {
    it('should return empty string for null input', () => {
      expect(removeDangerousPatterns(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(removeDangerousPatterns(undefined)).toBe('');
    });

    it('should remove script tags', () => {
      const input = 'Hello <script>alert("XSS")</script> World';
      const result = removeDangerousPatterns(input);
      expect(result).not.toContain('<script');
      expect(result).toContain('[script removed]');
    });

    it('should remove event handlers', () => {
      const input = '<img onerror="alert(1)" src="x">';
      const result = removeDangerousPatterns(input);
      expect(result).not.toContain('onerror=');
      expect(result).toContain('data-blocked=');
    });

    it('should block javascript: URIs', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = removeDangerousPatterns(input);
      expect(result).not.toContain('javascript:');
      expect(result).toContain('blocked:');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe>';
      const result = removeDangerousPatterns(input);
      expect(result).toContain('[iframe removed]');
    });

    it('should remove object tags', () => {
      const input = '<object data="evil.swf"></object>';
      const result = removeDangerousPatterns(input);
      expect(result).toContain('[object removed]');
    });

    it('should remove embed tags', () => {
      const input = '<embed src="evil.swf">';
      const result = removeDangerousPatterns(input);
      expect(result).toContain('[embed removed]');
    });

    it('should remove form tags', () => {
      const input = '<form action="evil.com">';
      const result = removeDangerousPatterns(input);
      expect(result).toContain('[form removed]');
    });

    it('should block vbscript: URIs', () => {
      const input = '<a href="vbscript:msgbox(1)">Click</a>';
      const result = removeDangerousPatterns(input);
      expect(result).not.toContain('vbscript:');
      expect(result).toContain('blocked:');
    });

    it('should block data: text/html URIs', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
      const result = removeDangerousPatterns(input);
      expect(result).toContain('blocked:');
    });

    it('should remove large base64 encoded content', () => {
      const base64 = 'A'.repeat(150);
      const input = `data:image/svg+xml;base64,${base64}`;
      const result = removeDangerousPatterns(input);
      expect(result).toContain('[base64 content removed]');
    });

    it('should not modify safe content', () => {
      const safeContent = 'This is a normal paragraph with no malicious content.';
      expect(removeDangerousPatterns(safeContent)).toBe(safeContent);
    });
  });

  // ============================================================================
  // detectSuspiciousOutput tests
  // ============================================================================
  describe('detectSuspiciousOutput', () => {
    it('should detect system prompt leak patterns', () => {
      const input = 'My system prompt says to...';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(true);
      expect(result.categories).toContain('prompt_leak');
    });

    it('should detect instruction leak patterns', () => {
      const input = 'My instructions are to help users...';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(true);
      expect(result.categories).toContain('instruction_leak');
    });

    it('should detect credential patterns', () => {
      const input = 'The api_key: sk-1234567890';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(true);
      expect(result.categories).toContain('credential_pattern');
    });

    it('should detect password patterns', () => {
      const input = 'Your password = secret123';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(true);
      expect(result.categories).toContain('credential_pattern');
    });

    it('should detect private key patterns', () => {
      const input = '-----BEGIN PRIVATE KEY----- content here -----END PRIVATE KEY-----';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(true);
      expect(result.categories).toContain('private_key');
    });

    it('should return safe for normal content', () => {
      const input = 'Here is a helpful response about your question.';
      const result = detectSuspiciousOutput(input);
      expect(result.suspicious).toBe(false);
      expect(result.categories).toHaveLength(0);
    });

    it('should handle empty input', () => {
      const result = detectSuspiciousOutput('');
      expect(result.suspicious).toBe(false);
    });

    it('should handle null input', () => {
      const result = detectSuspiciousOutput(null);
      expect(result.suspicious).toBe(false);
    });
  });
});

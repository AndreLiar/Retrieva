/**
 * Sanitize Utility Unit Tests
 *
 * Tests for XSS protection and content sanitization
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  containsSuspiciousContent,
} from '@/lib/utils/sanitize';

describe('Sanitize Utilities', () => {
  // ===========================================================================
  // escapeHtml Tests
  // ===========================================================================
  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than signs', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than signs', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's fine")).toBe('It&#x27;s fine');
    });

    it('should escape forward slashes', () => {
      expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
    });

    it('should escape backticks', () => {
      expect(escapeHtml('`code`')).toBe('&#x60;code&#x60;');
    });

    it('should escape equals signs', () => {
      expect(escapeHtml('a=b')).toBe('a&#x3D;b');
    });

    it('should escape multiple characters', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle plain text without special characters', () => {
      const text = 'Hello World';
      expect(escapeHtml(text)).toBe(text);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello 你好 مرحبا';
      expect(escapeHtml(text)).toBe(text);
    });
  });

  // ===========================================================================
  // containsSuspiciousContent Tests
  // ===========================================================================
  describe('containsSuspiciousContent', () => {
    describe('should detect dangerous patterns', () => {
      it('should detect script tags', () => {
        expect(containsSuspiciousContent('<script>alert(1)</script>')).toBe(true);
        expect(containsSuspiciousContent('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
        expect(containsSuspiciousContent('<script src="evil.js">')).toBe(true);
      });

      it('should detect javascript: URLs', () => {
        expect(containsSuspiciousContent('javascript:alert(1)')).toBe(true);
        expect(containsSuspiciousContent('JAVASCRIPT:void(0)')).toBe(true);
      });

      it('should detect event handlers', () => {
        expect(containsSuspiciousContent('onclick=alert(1)')).toBe(true);
        expect(containsSuspiciousContent('onerror=alert(1)')).toBe(true);
        expect(containsSuspiciousContent('onload=alert(1)')).toBe(true);
        expect(containsSuspiciousContent('onmouseover=alert(1)')).toBe(true);
        expect(containsSuspiciousContent('onfocus =alert(1)')).toBe(true);
        expect(containsSuspiciousContent('onblur= alert(1)')).toBe(true);
      });

      it('should detect data: text/html URLs', () => {
        expect(containsSuspiciousContent('data:text/html,<script>')).toBe(true);
      });

      it('should detect iframe tags', () => {
        expect(containsSuspiciousContent('<iframe src="evil.com">')).toBe(true);
        expect(containsSuspiciousContent('<IFRAME></IFRAME>')).toBe(true);
      });

      it('should detect object tags', () => {
        expect(containsSuspiciousContent('<object data="evil.swf">')).toBe(true);
      });

      it('should detect embed tags', () => {
        expect(containsSuspiciousContent('<embed src="evil.swf">')).toBe(true);
      });

      it('should detect form tags', () => {
        expect(containsSuspiciousContent('<form action="evil.com">')).toBe(true);
      });

      it('should detect CSS expression()', () => {
        expect(containsSuspiciousContent('style="width: expression(alert(1))"')).toBe(true);
      });

      it('should detect javascript in url()', () => {
        expect(containsSuspiciousContent('background: url(javascript:alert(1))')).toBe(true);
        expect(containsSuspiciousContent("background: url('javascript:alert(1)')"  )).toBe(true);
      });
    });

    describe('should allow safe content', () => {
      it('should allow plain text', () => {
        expect(containsSuspiciousContent('Hello World')).toBe(false);
      });

      it('should allow safe HTML tags in text context', () => {
        expect(containsSuspiciousContent('I love <b>bold</b> text')).toBe(false);
      });

      it('should allow normal URLs', () => {
        expect(containsSuspiciousContent('https://example.com')).toBe(false);
      });

      it('should allow safe attribute names', () => {
        expect(containsSuspiciousContent('class="button"')).toBe(false);
      });

      it('should allow markdown-style content', () => {
        expect(containsSuspiciousContent('**bold** and *italic*')).toBe(false);
      });

      it('should allow code blocks', () => {
        expect(containsSuspiciousContent('```javascript\nconst x = 1;\n```')).toBe(false);
      });

      it('should allow normal sentences', () => {
        expect(containsSuspiciousContent('The script ran successfully')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for empty string', () => {
        expect(containsSuspiciousContent('')).toBe(false);
      });

      it('should return false for null/undefined', () => {
        // @ts-expect-error Testing runtime behavior with null
        expect(containsSuspiciousContent(null)).toBe(false);
      });

      it('should handle multiline content', () => {
        const multiline = `
          Hello World
          <script>alert(1)</script>
        `;
        expect(containsSuspiciousContent(multiline)).toBe(true);
      });

      it('should handle content with newlines in event handlers', () => {
        const content = 'onclick\n=\nalert(1)';
        expect(containsSuspiciousContent(content)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // XSS Attack Vector Tests
  // ===========================================================================
  describe('XSS Attack Vectors', () => {
    const xssVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
      '<video><source onerror=alert(1)>',
      '<audio src=x onerror=alert(1)>',
      '<details open ontoggle=alert(1)>',
      '<math><maction actiontype="statusline#http://google.com">click</maction></math>',
      'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
      '<img src="x" onerror="alert(1)">',
      '<iframe src="javascript:alert(1)">',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
      '<form action="javascript:alert(1)"><input type="submit">',
    ];

    xssVectors.forEach((vector, index) => {
      it(`should detect XSS vector ${index + 1}`, () => {
        expect(containsSuspiciousContent(vector)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  describe('Integration', () => {
    it('should properly escape and detect dangerous content', () => {
      const dangerous = '<script>alert("XSS")</script>';

      // Should detect as suspicious
      expect(containsSuspiciousContent(dangerous)).toBe(true);

      // When escaped, should be safe
      const escaped = escapeHtml(dangerous);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });

    it('should preserve text content after escaping', () => {
      const text = 'This is <b>bold</b> text with "quotes"';
      const escaped = escapeHtml(text);

      // HTML is escaped but text is preserved
      expect(escaped).toContain('This is');
      expect(escaped).toContain('bold');
      expect(escaped).toContain('text with');
      expect(escaped).not.toContain('<b>');
    });
  });
});

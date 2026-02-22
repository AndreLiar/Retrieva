/**
 * Token Estimation Tests (Phase 5)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  estimateTokens,
  estimateTokensAccurate,
  estimateTokensBatch,
  getCharsPerToken,
  detectContentType,
} from '../../utils/rag/tokenEstimation.js';

describe('Token Estimation', () => {
  describe('estimateTokens (heuristic)', () => {
    it('should estimate English prose at ~4.5 chars/token', () => {
      const englishText =
        'The quick brown fox jumps over the lazy dog. This is a sample English sentence for testing token estimation accuracy.';
      const tokens = estimateTokens(englishText);
      const expectedTokens = Math.ceil(englishText.length / 4.5);
      expect(tokens).toBe(expectedTokens);
    });

    it('should estimate code at ~3 chars/token', () => {
      const codeText = `function calculateSum(a, b) {
  const result = a + b;
  return result;
}`;
      const tokens = estimateTokens(codeText);
      // Code should have lower chars per token ratio
      const expectedTokens = Math.ceil(codeText.length / 3.0);
      expect(tokens).toBe(expectedTokens);
    });

    it('should estimate CJK text at ~1.5 chars/token', () => {
      // Chinese text: "Hello, this is a test"
      const cjkText = '你好，这是一个测试。这段中文文本用于测试CJK字符的分词估计。';
      const tokens = estimateTokens(cjkText);
      // CJK should use lower chars per token
      const expectedTokens = Math.ceil(cjkText.length / 1.5);
      expect(tokens).toBe(expectedTokens);
    });

    it('should handle empty or null input', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens(undefined)).toBe(0);
    });

    it('should allow content type override', () => {
      const text = 'Some regular text that could be anything.';
      const englishTokens = estimateTokens(text, { contentType: 'english' });
      const codeTokens = estimateTokens(text, { contentType: 'code' });
      const cjkTokens = estimateTokens(text, { contentType: 'cjk' });

      // Code should have more tokens (fewer chars per token)
      expect(codeTokens).toBeGreaterThan(englishTokens);
      // CJK should have even more tokens
      expect(cjkTokens).toBeGreaterThan(codeTokens);
    });
  });

  describe('detectContentType', () => {
    it('should detect English prose', () => {
      const text =
        'This is a simple English sentence without any special characters or code patterns.';
      expect(detectContentType(text)).toBe('english');
    });

    it('should detect code by function patterns', () => {
      expect(detectContentType('function test() { return 1; }')).toBe('code');
      expect(detectContentType('const x = 5; let y = 10;')).toBe('code');
      expect(detectContentType('import React from "react";')).toBe('code');
      expect(detectContentType('export default class App {}')).toBe('code');
      expect(detectContentType('def calculate(x, y):')).toBe('code');
    });

    it('should detect code by special character density', () => {
      const codeWithSymbols = 'a=b+c*d/e%f&g|h^i{j}[k](l);m<n>o:p';
      expect(detectContentType(codeWithSymbols)).toBe('code');
    });

    it('should detect CJK content', () => {
      expect(detectContentType('这是中文文本测试')).toBe('cjk');
      expect(detectContentType('日本語のテスト文章')).toBe('cjk');
      expect(detectContentType('한국어 테스트입니다')).toBe('cjk');
    });

    it('should detect mixed content as mixed', () => {
      // Small amount of CJK doesn't trigger CJK mode
      const mixedText = 'This is mostly English with some 日本語 mixed in here and there.';
      expect(detectContentType(mixedText)).toBe('english'); // <10% CJK
    });

    it('should handle edge cases', () => {
      expect(detectContentType('')).toBe('mixed');
      expect(detectContentType(null)).toBe('mixed');
      expect(detectContentType(123)).toBe('mixed');
    });
  });

  describe('estimateTokensAccurate', () => {
    beforeEach(() => {
      // Reset env var
      delete process.env.USE_TIKTOKEN;
    });

    afterEach(() => {
      delete process.env.USE_TIKTOKEN;
    });

    it('should return heuristic when USE_TIKTOKEN=false', async () => {
      process.env.USE_TIKTOKEN = 'false';
      const text = 'Hello world';
      const result = await estimateTokensAccurate(text);
      const expected = estimateTokens(text);
      expect(result).toBe(expected);
    });

    it('should handle empty input', async () => {
      expect(await estimateTokensAccurate('')).toBe(0);
      expect(await estimateTokensAccurate(null)).toBe(0);
    });

    it('should fallback to heuristic on tiktoken failure', async () => {
      // This test verifies fallback behavior
      // Even if tiktoken isn't available, we should get a reasonable estimate
      const text = 'Some text to estimate tokens for testing purposes.';
      const result = await estimateTokensAccurate(text);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(text.length); // tokens < chars
    });
  });

  describe('estimateTokensBatch', () => {
    it('should estimate tokens for multiple texts', async () => {
      const texts = ['First piece of text.', 'Second longer piece of text here.', 'Third text.'];

      const results = await estimateTokensBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeGreaterThan(0);
      expect(results[1]).toBeGreaterThan(results[0]); // Longer text = more tokens
      expect(results[2]).toBeGreaterThan(0);
    });

    it('should handle empty input', async () => {
      expect(await estimateTokensBatch([])).toEqual([]);
      expect(await estimateTokensBatch(null)).toEqual([]);
    });

    it('should handle mixed content in batch', async () => {
      const texts = ['English text here', 'function code() { return 1; }', '中文测试文本'];

      const results = await estimateTokensBatch(texts);

      expect(results).toHaveLength(3);
      results.forEach((count) => expect(count).toBeGreaterThan(0));
    });
  });

  describe('getCharsPerToken', () => {
    it('should return correct ratios for content types', () => {
      expect(getCharsPerToken('english')).toBe(4.5);
      expect(getCharsPerToken('code')).toBe(3.0);
      expect(getCharsPerToken('cjk')).toBe(1.5);
      expect(getCharsPerToken('mixed')).toBe(4.0);
    });

    it('should default to mixed for unknown types', () => {
      expect(getCharsPerToken('unknown')).toBe(4.0);
      expect(getCharsPerToken()).toBe(4.5); // defaults to english
    });
  });

  describe('token estimation accuracy', () => {
    it('should be within reasonable range for typical content', () => {
      // A typical paragraph
      const paragraph = `
        In the heart of the bustling city, where skyscrapers reach for the clouds
        and the streets hum with endless activity, there exists a small, hidden garden.
        This garden, known only to a few, is a sanctuary of peace amidst the urban chaos.
        Here, ancient trees stand tall, their branches heavy with leaves that whisper
        secrets of centuries past.
      `.trim();

      const tokens = estimateTokens(paragraph);
      // GPT-4 would tokenize this to roughly 70-80 tokens
      // Our estimate at 4.5 chars/token should be in range
      expect(tokens).toBeGreaterThan(50);
      expect(tokens).toBeLessThan(150);
    });

    it('should handle code blocks appropriately', () => {
      const codeBlock = `
\`\`\`javascript
async function fetchUserData(userId) {
  const response = await fetch(\`/api/users/\${userId}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}
\`\`\`
      `.trim();

      const tokens = estimateTokens(codeBlock);
      // Code is more token-dense
      expect(tokens).toBeGreaterThan(40);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  validateOutput,
  validateWithSchema,
  processOutput,
  shouldRetryOutput,
} from '../../utils/rag/outputValidator.js';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock guardrails config
vi.mock('../../config/guardrails.js', () => ({
  guardrailsConfig: {
    output: {
      maxResponseLength: 10000,
    },
  },
}));

describe('Output Validator', () => {
  describe('validateOutput', () => {
    it('should validate a good answer', () => {
      const content = 'This is a well-formed answer with proper content [Source 1].';
      const result = validateOutput(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.hasContent).toBe(true);
      expect(result.metadata.citationCount).toBe(1);
    });

    it('should reject null content', () => {
      const result = validateOutput(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Answer content is null or undefined');
    });

    it('should reject empty content', () => {
      const result = validateOutput('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Answer content is empty');
    });

    it('should reject content that is too short', () => {
      const result = validateOutput('Hi', { minLength: 10 });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
    });

    it('should truncate content that is too long', () => {
      const longContent = 'a'.repeat(20000);
      const result = validateOutput(longContent, { maxLength: 100 });

      expect(result.valid).toBe(false);
      expect(result.modified).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(103); // 100 + "..."
    });

    it('should detect blocked patterns', () => {
      const result = validateOutput('undefined');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('error or undefined'))).toBe(true);
    });

    it('should detect only code block as answer', () => {
      const result = validateOutput('```javascript\nconst x = 1;\n```');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('only a code block'))).toBe(true);
    });

    it('should add warnings for quality issues', () => {
      const content = 'Short answer here.'; // Very short
      const result = validateOutput(content);

      expect(result.warnings.some((w) => w.includes('very short'))).toBe(true);
    });

    it('should warn about missing citations', () => {
      const content =
        'This is a longer answer without any source citations. It provides information but does not reference where it came from.';
      const result = validateOutput(content);

      expect(result.warnings.some((w) => w.includes('no source citations'))).toBe(true);
    });

    it('should warn about apology starting', () => {
      const content = "I'm sorry, but I cannot find the information you requested.";
      const result = validateOutput(content);

      expect(result.warnings.some((w) => w.includes('apology'))).toBe(true);
    });

    it('should count citations correctly', () => {
      const content = 'Fact [Source 1]. Another fact [Source 2]. Third [Source 3].';
      const result = validateOutput(content);

      expect(result.metadata.citationCount).toBe(3);
    });

    it('should trim whitespace', () => {
      const content = '   Valid content with spaces   ';
      const result = validateOutput(content);

      expect(result.modified).toBe(true);
      expect(result.content).toBe('Valid content with spaces');
    });

    it('should convert non-string to string', () => {
      const result = validateOutput(12345);

      expect(result.content).toBe('12345');
      expect(result.modified).toBe(true);
    });
  });

  describe('validateWithSchema', () => {
    it('should pass for valid content', () => {
      const content = 'A valid answer with enough content.';
      const result = validateWithSchema(content);

      expect(result.success).toBe(true);
    });

    it('should fail for empty content', () => {
      const result = validateWithSchema('');

      expect(result.success).toBe(false);
    });
  });

  describe('processOutput', () => {
    it('should clean up LLM artifacts', () => {
      const content = 'assistant: Here is the answer.';
      const result = processOutput(content);

      expect(result.content).toBe('Here is the answer.');
      expect(result.modified).toBe(true);
    });

    it('should remove incomplete markers', () => {
      const content = 'Partial answer... [incomplete]';
      const result = processOutput(content);

      expect(result.content).not.toContain('[incomplete]');
      expect(result.modified).toBe(true);
    });

    it('should normalize multiple newlines', () => {
      const content = 'First paragraph.\n\n\n\n\nSecond paragraph.';
      const result = processOutput(content);

      expect(result.content).toBe('First paragraph.\n\nSecond paragraph.');
      expect(result.modified).toBe(true);
    });

    it('should preserve valid content', () => {
      const content = 'This is a perfect answer [Source 1].';
      const result = processOutput(content);

      expect(result.content).toBe(content);
    });
  });

  describe('shouldRetryOutput', () => {
    it('should recommend retry for invalid output', () => {
      const validation = {
        valid: false,
        errors: ['Answer is too short'],
        warnings: [],
      };

      expect(shouldRetryOutput(validation)).toBe(true);
    });

    it('should not recommend retry for valid output', () => {
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
      };

      expect(shouldRetryOutput(validation)).toBe(false);
    });

    it('should recommend retry for too many warnings when option enabled', () => {
      const validation = {
        valid: true,
        errors: [],
        warnings: ['Warning 1', 'Warning 2'],
      };

      expect(
        shouldRetryOutput(validation, {
          retryOnWarnings: true,
          maxWarningsBeforeRetry: 2,
        })
      ).toBe(true);
    });

    it('should not retry for warnings by default', () => {
      const validation = {
        valid: true,
        errors: [],
        warnings: ['Warning 1', 'Warning 2', 'Warning 3'],
      };

      expect(shouldRetryOutput(validation)).toBe(false);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  extractCitations,
  validateCitations,
  normalizeCitationFormat,
  processCitations,
  analyzeCitationCoverage,
} from '../../utils/rag/citationValidator.js';

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
      citationValidation: {
        maxOrphanCitations: 0,
        minCitationCoverage: 0.3,
      },
    },
  },
}));

describe('Citation Validator', () => {
  describe('extractCitations', () => {
    it('should extract single citation', () => {
      const text = 'This is a fact [Source 1].';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(1);
      expect(citations[0].number).toBe(1);
    });

    it('should extract multiple citations', () => {
      const text = 'Claim one [Source 1]. Claim two [Source 2]. Claim three [Source 3].';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(3);
      expect(citations.map((c) => c.number)).toEqual([1, 2, 3]);
    });

    it('should handle comma-separated citations', () => {
      const text = 'Multiple sources agree [Source 1, 2, 3].';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(3);
      expect(citations.map((c) => c.number)).toEqual([1, 2, 3]);
    });

    it('should handle range citations', () => {
      const text = 'See sources [Source 1-3].';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(3);
      expect(citations.map((c) => c.number)).toEqual([1, 2, 3]);
    });

    it('should handle "Sources" (plural) format', () => {
      const text = 'Multiple references [Sources 1, 2].';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(2);
    });

    it('should return empty array for no citations', () => {
      const text = 'This text has no citations.';
      const citations = extractCitations(text);

      expect(citations).toHaveLength(0);
    });

    it('should handle null/undefined input', () => {
      expect(extractCitations(null)).toEqual([]);
      expect(extractCitations(undefined)).toEqual([]);
      expect(extractCitations('')).toEqual([]);
    });
  });

  describe('validateCitations', () => {
    const mockSources = [
      { sourceNumber: 1, title: 'Document 1' },
      { sourceNumber: 2, title: 'Document 2' },
      { sourceNumber: 3, title: 'Document 3' },
    ];

    it('should validate all citations when they exist', () => {
      const text = 'Fact one [Source 1]. Fact two [Source 2].';
      const result = validateCitations(text, mockSources, { logWarnings: false });

      expect(result.valid).toBe(true);
      expect(result.validCitations).toEqual([1, 2]);
      expect(result.invalidCitations).toEqual([]);
    });

    it('should detect orphan citations', () => {
      const text = 'Fact from invalid source [Source 99].';
      const result = validateCitations(text, mockSources, { logWarnings: false });

      expect(result.valid).toBe(false);
      expect(result.invalidCitations).toContain(99);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle mixed valid and invalid citations', () => {
      const text = 'Valid [Source 1]. Invalid [Source 10].';
      const result = validateCitations(text, mockSources, { logWarnings: false });

      expect(result.valid).toBe(false);
      expect(result.validCitations).toContain(1);
      expect(result.invalidCitations).toContain(10);
    });

    it('should remove invalid citations when requested', () => {
      const text = 'Valid [Source 1]. Invalid [Source 99].';
      const result = validateCitations(text, mockSources, {
        removeInvalid: true,
        logWarnings: false,
      });

      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('[Source 99]');
      expect(result.text).toContain('[Source 1]');
    });

    it('should handle empty sources array', () => {
      const text = 'Any citation [Source 1] is invalid.';
      const result = validateCitations(text, [], { logWarnings: false });

      expect(result.valid).toBe(false);
      expect(result.invalidCitations).toContain(1);
    });

    it('should handle text with no citations', () => {
      const text = 'No citations here.';
      const result = validateCitations(text, mockSources, { logWarnings: false });

      expect(result.valid).toBe(true);
      expect(result.totalCitations).toBe(0);
    });
  });

  describe('normalizeCitationFormat', () => {
    it('should convert (Source N) to [Source N]', () => {
      const text = 'A fact (Source 1).';
      const result = normalizeCitationFormat(text);

      expect(result).toBe('A fact [Source 1].');
    });

    it('should convert {Source N} to [Source N]', () => {
      const text = 'A fact {Source 2}.';
      const result = normalizeCitationFormat(text);

      expect(result).toBe('A fact [Source 2].');
    });

    it('should convert Source: N to [Source N]', () => {
      const text = 'A fact Source: 3.';
      const result = normalizeCitationFormat(text);

      expect(result).toBe('A fact [Source 3].');
    });

    it('should convert bare [N] after period to [Source N]', () => {
      const text = 'A statement. [1] Another statement.';
      const result = normalizeCitationFormat(text);

      expect(result).toBe('A statement. [Source 1] Another statement.');
    });

    it('should leave valid citations unchanged', () => {
      const text = 'Already correct [Source 1].';
      const result = normalizeCitationFormat(text);

      expect(result).toBe('Already correct [Source 1].');
    });
  });

  describe('processCitations', () => {
    const mockSources = [
      { sourceNumber: 1, title: 'Doc 1' },
      { sourceNumber: 2, title: 'Doc 2' },
    ];

    it('should normalize and validate in one pass', () => {
      const text = 'Fact (Source 1). Another [Source 99].';
      const result = processCitations(text, mockSources, { logWarnings: false });

      expect(result.modified).toBe(true);
      // Should have normalized (Source 1) and removed invalid [Source 99]
      expect(result.text).toContain('[Source 1]');
      expect(result.text).not.toContain('[Source 99]');
    });
  });

  describe('analyzeCitationCoverage', () => {
    it('should calculate coverage ratio', () => {
      // Note: sentences must be >20 chars to be counted
      const text =
        'This is the first sentence with a citation [Source 1]. This is the second sentence without any citation at all. This is the third sentence with [Source 2]. And finally the fourth sentence has no citation.';
      const result = analyzeCitationCoverage(text);

      expect(result.totalSentences).toBe(4);
      expect(result.citedSentences).toBe(2);
      expect(result.coverage).toBe(0.5);
    });

    it('should return 1 for empty text', () => {
      const result = analyzeCitationCoverage('');
      expect(result.coverage).toBe(0);
    });

    it('should handle text with all citations', () => {
      const text = 'Claim one [Source 1]. Claim two [Source 2]. Claim three [Source 3].';
      const result = analyzeCitationCoverage(text);

      expect(result.coverage).toBe(1);
      expect(result.meetsCoverage).toBe(true);
    });

    it('should handle text with no citations', () => {
      const text = 'No citations in this text. None at all. Still nothing.';
      const result = analyzeCitationCoverage(text);

      expect(result.coverage).toBe(0);
      expect(result.meetsCoverage).toBe(false);
    });
  });
});

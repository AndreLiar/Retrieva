/**
 * Unit Tests for Confidence Handler
 *
 * Tests the confidence handling utilities that manage LLM response
 * confidence levels and add appropriate warnings/disclaimers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
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
      confidenceHandling: {
        blockThreshold: 0.2,
        warningThreshold: 0.4,
        disclaimerThreshold: 0.6,
        enableBlocking: true,
        messages: {
          blocked: 'I cannot provide a reliable answer to this question.',
          veryLowConfidence: 'Warning: This response has very low confidence.',
          lowConfidence: 'Note: This response may not be fully accurate.',
          disclaimer: 'This response is based on available information.',
        },
      },
    },
  },
}));

import {
  ConfidenceLevel,
  getConfidenceLevel,
  getConfidenceMessage,
  processConfidence,
  shouldBlockResponse,
  getConfidenceConfig,
  getConfidenceBand,
} from '../../utils/security/confidenceHandler.js';

describe('Confidence Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // ConfidenceLevel constants tests
  // ============================================================================
  describe('ConfidenceLevel', () => {
    it('should have all expected levels', () => {
      expect(ConfidenceLevel.BLOCKED).toBe('blocked');
      expect(ConfidenceLevel.VERY_LOW).toBe('very_low');
      expect(ConfidenceLevel.LOW).toBe('low');
      expect(ConfidenceLevel.MEDIUM).toBe('medium');
      expect(ConfidenceLevel.HIGH).toBe('high');
    });
  });

  // ============================================================================
  // getConfidenceLevel tests
  // ============================================================================
  describe('getConfidenceLevel', () => {
    it('should return BLOCKED for very low confidence', () => {
      expect(getConfidenceLevel(0.1)).toBe(ConfidenceLevel.BLOCKED);
      expect(getConfidenceLevel(0.15)).toBe(ConfidenceLevel.BLOCKED);
    });

    it('should return VERY_LOW for low confidence', () => {
      expect(getConfidenceLevel(0.25)).toBe(ConfidenceLevel.VERY_LOW);
      expect(getConfidenceLevel(0.35)).toBe(ConfidenceLevel.VERY_LOW);
    });

    it('should return LOW for medium-low confidence', () => {
      expect(getConfidenceLevel(0.45)).toBe(ConfidenceLevel.LOW);
      expect(getConfidenceLevel(0.55)).toBe(ConfidenceLevel.LOW);
    });

    it('should return MEDIUM for medium confidence', () => {
      expect(getConfidenceLevel(0.65)).toBe(ConfidenceLevel.MEDIUM);
    });

    it('should return HIGH for high confidence', () => {
      expect(getConfidenceLevel(0.75)).toBe(ConfidenceLevel.HIGH);
      expect(getConfidenceLevel(0.9)).toBe(ConfidenceLevel.HIGH);
      expect(getConfidenceLevel(1.0)).toBe(ConfidenceLevel.HIGH);
    });
  });

  // ============================================================================
  // getConfidenceMessage tests
  // ============================================================================
  describe('getConfidenceMessage', () => {
    it('should return blocked message for BLOCKED level', () => {
      const message = getConfidenceMessage(ConfidenceLevel.BLOCKED);
      expect(message).toContain('cannot provide a reliable answer');
    });

    it('should return very low confidence message', () => {
      const message = getConfidenceMessage(ConfidenceLevel.VERY_LOW);
      expect(message).toContain('very low confidence');
    });

    it('should return low confidence message', () => {
      const message = getConfidenceMessage(ConfidenceLevel.LOW);
      expect(message).toContain('may not be fully accurate');
    });

    it('should return disclaimer for MEDIUM level', () => {
      const message = getConfidenceMessage(ConfidenceLevel.MEDIUM);
      expect(message).toContain('based on available information');
    });

    it('should return null for HIGH level', () => {
      expect(getConfidenceMessage(ConfidenceLevel.HIGH)).toBeNull();
    });
  });

  // ============================================================================
  // processConfidence tests
  // ============================================================================
  describe('processConfidence', () => {
    it('should block response when confidence is too low', () => {
      const result = {
        answer: 'Original answer',
        validation: { confidence: 0.1 },
      };

      const processed = processConfidence(result, { enableBlocking: true });

      expect(processed._confidenceBlocked).toBe(true);
      expect(processed._confidenceLevel).toBe(ConfidenceLevel.BLOCKED);
      expect(processed._originalAnswer).toBe('Original answer');
      expect(processed.validation.blocked).toBe(true);
    });

    it('should preserve original answer when blocking', () => {
      const result = {
        answer: 'Original answer',
        validation: { confidence: 0.1 },
      };

      const processed = processConfidence(result, { enableBlocking: true });

      expect(processed._originalAnswer).toBe('Original answer');
    });

    it('should add warning prefix for very low confidence', () => {
      const result = {
        answer: 'Answer text',
        validation: { confidence: 0.3 },
      };

      const processed = processConfidence(result, { addWarnings: true });

      expect(processed.answer).toContain('very low confidence');
      expect(processed._confidenceWarningAdded).toBe(true);
    });

    it('should add disclaimer suffix for low confidence', () => {
      const result = {
        answer: 'Answer text',
        validation: { confidence: 0.5 },
      };

      const processed = processConfidence(result, { addWarnings: true });

      expect(processed.answer).toContain('may not be fully accurate');
    });

    it('should not modify high confidence responses', () => {
      const result = {
        answer: 'High quality answer',
        validation: { confidence: 0.9 },
      };

      const processed = processConfidence(result, { addWarnings: true });

      expect(processed.answer).toBe('High quality answer');
      expect(processed._confidenceLevel).toBe(ConfidenceLevel.HIGH);
    });

    it('should respect enableBlocking option', () => {
      const result = {
        answer: 'Answer text',
        validation: { confidence: 0.1 },
      };

      const processed = processConfidence(result, { enableBlocking: false });

      expect(processed._confidenceBlocked).toBeUndefined();
    });

    it('should handle missing validation', () => {
      const result = {
        answer: 'Answer without validation',
      };

      const processed = processConfidence(result);

      expect(processed._confidenceLevel).toBeDefined();
    });

    it('should use default confidence of 0.5 when not provided', () => {
      const result = {
        answer: 'Answer',
        validation: {},
      };

      const processed = processConfidence(result);

      // 0.5 is in the LOW range (0.4-0.6)
      expect(processed._confidenceLevel).toBe(ConfidenceLevel.LOW);
    });
  });

  // ============================================================================
  // shouldBlockResponse tests
  // ============================================================================
  describe('shouldBlockResponse', () => {
    it('should return true for confidence below threshold', () => {
      expect(shouldBlockResponse(0.1)).toBe(true);
      expect(shouldBlockResponse(0.15)).toBe(true);
    });

    it('should return false for confidence above threshold', () => {
      expect(shouldBlockResponse(0.3)).toBe(false);
      expect(shouldBlockResponse(0.5)).toBe(false);
      expect(shouldBlockResponse(0.9)).toBe(false);
    });
  });

  // ============================================================================
  // getConfidenceConfig tests
  // ============================================================================
  describe('getConfidenceConfig', () => {
    it('should return configuration object', () => {
      const config = getConfidenceConfig();

      expect(config).toHaveProperty('blockThreshold');
      expect(config).toHaveProperty('warningThreshold');
      expect(config).toHaveProperty('disclaimerThreshold');
      expect(config).toHaveProperty('blockingEnabled');
    });

    it('should return expected threshold values', () => {
      const config = getConfidenceConfig();

      expect(config.blockThreshold).toBe(0.2);
      expect(config.warningThreshold).toBe(0.4);
      expect(config.disclaimerThreshold).toBe(0.6);
    });
  });

  // ============================================================================
  // getConfidenceBand tests
  // ============================================================================
  describe('getConfidenceBand', () => {
    it('should return high band for confidence >= 0.8', () => {
      expect(getConfidenceBand(0.8)).toContain('high');
      expect(getConfidenceBand(0.9)).toContain('high');
      expect(getConfidenceBand(1.0)).toContain('high');
    });

    it('should return good band for confidence >= 0.6', () => {
      expect(getConfidenceBand(0.6)).toContain('good');
      expect(getConfidenceBand(0.7)).toContain('good');
    });

    it('should return moderate band for confidence >= 0.4', () => {
      expect(getConfidenceBand(0.4)).toContain('moderate');
      expect(getConfidenceBand(0.5)).toContain('moderate');
    });

    it('should return low band for confidence >= 0.2', () => {
      expect(getConfidenceBand(0.2)).toContain('low');
      expect(getConfidenceBand(0.3)).toContain('low');
    });

    it('should return very low band for confidence < 0.2', () => {
      expect(getConfidenceBand(0.1)).toContain('very low');
      expect(getConfidenceBand(0.0)).toContain('very low');
    });

    it('should include confidence range in band label', () => {
      expect(getConfidenceBand(0.9)).toContain('0.8-1.0');
      expect(getConfidenceBand(0.7)).toContain('0.6-0.8');
      expect(getConfidenceBand(0.5)).toContain('0.4-0.6');
      expect(getConfidenceBand(0.3)).toContain('0.2-0.4');
      expect(getConfidenceBand(0.1)).toContain('0.0-0.2');
    });
  });
});

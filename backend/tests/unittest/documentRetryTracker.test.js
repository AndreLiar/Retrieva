/**
 * Unit Tests — DocumentRetryTracker
 *
 * Tests retry/skip logic for document processing failures.
 * No external dependencies — pure class logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import DocumentRetryTracker, {
  documentRetryTracker,
} from '../../utils/rag/documentRetryTracker.js';

// ─── DocumentRetryTracker class ───────────────────────────────────────────────

describe('DocumentRetryTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new DocumentRetryTracker(3);
  });

  // ── recordFailure ────────────────────────────────────────────────────────────

  describe('recordFailure', () => {
    it('returns false when failure count is below maxRetries', () => {
      const result = tracker.recordFailure('doc-1', new Error('timeout'));
      expect(result).toBe(false);
    });

    it('returns true when failure count reaches maxRetries', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-1', new Error('err'));
      const result = tracker.recordFailure('doc-1', new Error('err'));
      expect(result).toBe(true);
    });

    it('increments count on each call', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-1', new Error('err'));
      const info = tracker.getFailureInfo('doc-1');
      expect(info.count).toBe(2);
    });

    it('stores last error message', () => {
      tracker.recordFailure('doc-1', new Error('connection reset'));
      const info = tracker.getFailureInfo('doc-1');
      expect(info.lastError).toBe('connection reset');
    });

    it('accumulates errors array', () => {
      tracker.recordFailure('doc-1', new Error('first'));
      tracker.recordFailure('doc-1', new Error('second'));
      const info = tracker.getFailureInfo('doc-1');
      expect(info.errors).toHaveLength(2);
      expect(info.errors[0].message).toBe('first');
      expect(info.errors[1].message).toBe('second');
    });

    it('stores a timestamp', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      const info = tracker.getFailureInfo('doc-1');
      expect(info.timestamp).toBeInstanceOf(Date);
    });

    it('tracks failures independently per document', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-2', new Error('err'));
      tracker.recordFailure('doc-2', new Error('err'));

      expect(tracker.getFailureInfo('doc-1').count).toBe(1);
      expect(tracker.getFailureInfo('doc-2').count).toBe(2);
    });
  });

  // ── shouldSkip ───────────────────────────────────────────────────────────────

  describe('shouldSkip', () => {
    it('returns falsy for unknown document', () => {
      expect(tracker.shouldSkip('unknown-doc')).toBeFalsy();
    });

    it('returns false when below maxRetries', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      expect(tracker.shouldSkip('doc-1')).toBe(false);
    });

    it('returns true when at maxRetries', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-1', new Error('err'));
      expect(tracker.shouldSkip('doc-1')).toBe(true);
    });
  });

  // ── getFailureInfo ───────────────────────────────────────────────────────────

  describe('getFailureInfo', () => {
    it('returns null for unknown document', () => {
      expect(tracker.getFailureInfo('no-such-doc')).toBeNull();
    });

    it('returns failure info for known document', () => {
      tracker.recordFailure('doc-1', new Error('some error'));
      const info = tracker.getFailureInfo('doc-1');
      expect(info).not.toBeNull();
      expect(info.count).toBe(1);
    });
  });

  // ── resetFailures ────────────────────────────────────────────────────────────

  describe('resetFailures', () => {
    it('clears all failure records for a document', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.resetFailures('doc-1');
      expect(tracker.getFailureInfo('doc-1')).toBeNull();
      expect(tracker.shouldSkip('doc-1')).toBeFalsy();
    });

    it('does not affect other documents', () => {
      tracker.recordFailure('doc-1', new Error('err'));
      tracker.recordFailure('doc-2', new Error('err'));
      tracker.resetFailures('doc-1');
      expect(tracker.getFailureInfo('doc-2')).not.toBeNull();
    });
  });

  // ── getSkippedDocuments ──────────────────────────────────────────────────────

  describe('getSkippedDocuments', () => {
    it('returns empty array when no documents are skipped', () => {
      expect(tracker.getSkippedDocuments()).toEqual([]);
    });

    it('returns only documents that reached maxRetries', () => {
      tracker.recordFailure('doc-skip', new Error('err'));
      tracker.recordFailure('doc-skip', new Error('err'));
      tracker.recordFailure('doc-skip', new Error('err')); // at maxRetries

      tracker.recordFailure('doc-ok', new Error('err')); // below maxRetries

      const skipped = tracker.getSkippedDocuments();
      expect(skipped).toHaveLength(1);
      expect(skipped[0].documentId).toBe('doc-skip');
    });

    it('returns correct shape for each skipped document', () => {
      const err = new Error('disk full');
      tracker.recordFailure('doc-1', err);
      tracker.recordFailure('doc-1', err);
      tracker.recordFailure('doc-1', err);

      const [skipped] = tracker.getSkippedDocuments();
      expect(skipped).toMatchObject({
        documentId: 'doc-1',
        failureCount: 3,
        lastError: 'disk full',
      });
      expect(skipped.timestamp).toBeInstanceOf(Date);
      expect(skipped.errors).toHaveLength(3);
    });
  });

  // ── clearOldFailures ─────────────────────────────────────────────────────────

  describe('clearOldFailures', () => {
    it('removes failures older than maxAgeMs', () => {
      tracker.recordFailure('doc-old', new Error('err'));

      // Manually backdate the timestamp
      const info = tracker.failures.get('doc-old');
      info.timestamp = new Date(Date.now() - 2000); // 2 seconds ago

      tracker.clearOldFailures(1000); // 1 second threshold

      expect(tracker.getFailureInfo('doc-old')).toBeNull();
    });

    it('keeps failures younger than maxAgeMs', () => {
      tracker.recordFailure('doc-new', new Error('err'));

      tracker.clearOldFailures(60000); // 1 minute threshold

      expect(tracker.getFailureInfo('doc-new')).not.toBeNull();
    });

    it('clears multiple old entries at once', () => {
      tracker.recordFailure('doc-a', new Error('err'));
      tracker.recordFailure('doc-b', new Error('err'));

      const now = Date.now() - 5000;
      tracker.failures.get('doc-a').timestamp = new Date(now);
      tracker.failures.get('doc-b').timestamp = new Date(now);

      tracker.clearOldFailures(1000);

      expect(tracker.getFailureInfo('doc-a')).toBeNull();
      expect(tracker.getFailureInfo('doc-b')).toBeNull();
    });
  });

  // ── isRetryableError ─────────────────────────────────────────────────────────

  describe('isRetryableError', () => {
    it.each([
      ['invalid document format', false],
      ['unauthorized access', false],
      ['forbidden resource', false],
      ['workspace not found', false],
      ['validation failed: missing field', false],
    ])('returns false for non-retryable error: "%s"', (message, expected) => {
      expect(tracker.isRetryableError(new Error(message))).toBe(expected);
    });

    it.each([
      ['connection timeout', true],
      ['rate_limited by provider', true],
      ['connection refused', true],
      ['econnreset by peer', true],
      ['enotfound hostname', true],
      ['network unreachable', true],
    ])('returns true for retryable error: "%s"', (message, expected) => {
      expect(tracker.isRetryableError(new Error(message))).toBe(expected);
    });

    it('returns true for unknown error by default', () => {
      expect(tracker.isRetryableError(new Error('unexpected crash'))).toBe(true);
    });
  });
});

// ─── Singleton export ─────────────────────────────────────────────────────────

describe('documentRetryTracker singleton', () => {
  it('is an instance of DocumentRetryTracker', () => {
    expect(documentRetryTracker).toBeInstanceOf(DocumentRetryTracker);
  });

  it('has maxRetries of 3', () => {
    expect(documentRetryTracker.maxRetries).toBe(3);
  });
});

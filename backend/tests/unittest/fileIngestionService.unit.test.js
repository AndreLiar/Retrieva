import { describe, it, expect } from 'vitest';
import {
  chunkText,
  assessmentCollectionName,
  createFileIngestionService,
  fileIngestionService,
} from '../../services/fileIngestionService.js';

// ─── assessmentCollectionName ─────────────────────────────────────────────────

describe('assessmentCollectionName', () => {
  it('returns assessment_ prefixed collection name', () => {
    expect(assessmentCollectionName('abc123')).toBe('assessment_abc123');
  });
});

// ─── createFileIngestionService ───────────────────────────────────────────────

describe('createFileIngestionService', () => {
  it('returns an object with the expected methods', () => {
    const svc = createFileIngestionService();
    expect(typeof svc.ingestFile).toBe('function');
    expect(typeof svc.searchAssessmentChunks).toBe('function');
    expect(typeof svc.deleteAssessmentCollection).toBe('function');
    expect(typeof svc.chunkText).toBe('function');
  });

  it('fileIngestionService singleton has the same shape', () => {
    expect(typeof fileIngestionService.ingestFile).toBe('function');
  });
});

// ─── chunkText ────────────────────────────────────────────────────────────────

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\n   ')).toEqual([]);
  });

  it('filters chunks shorter than 30 chars', () => {
    const result = chunkText('Hi.\n\nOk.\n\nBye.');
    expect(result.every((c) => c.length > 30)).toBe(true);
  });

  it('returns a single chunk for short text', () => {
    const text = 'This is a short document that fits in one chunk without splitting.';
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('splits long text into multiple chunks', () => {
    const paragraph = 'A'.repeat(300);
    const text = [paragraph, paragraph, paragraph].join('\n\n');
    const result = chunkText(text, 400, 50);
    expect(result.length).toBeGreaterThan(1);
  });

  it('each chunk does not exceed the chunkSize (approximately)', () => {
    const paragraph = 'Word '.repeat(60); // ~300 chars each
    const text = Array(10).fill(paragraph).join('\n\n');
    const result = chunkText(text, 400, 80);
    // Allow some overflow from overlap but no chunk should be wildly large
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThan(600);
    });
  });

  it('handles text with no paragraph breaks', () => {
    const longSentences = 'This is sentence one. This is sentence two. '.repeat(20);
    const result = chunkText(longSentences, 200, 30);
    expect(result.length).toBeGreaterThan(0);
  });

  it('normalizes multiple blank lines between paragraphs', () => {
    const text = 'First paragraph.\n\n\n\n\nSecond paragraph that is long enough to be kept.';
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('respects custom chunkSize parameter', () => {
    const text = 'Short. '.repeat(30);
    const small = chunkText(text, 100, 10);
    const large = chunkText(text, 400, 10);
    expect(small.length).toBeGreaterThan(large.length);
  });
});

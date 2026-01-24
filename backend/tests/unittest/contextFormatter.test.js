/**
 * Unit Tests for Context Formatter
 *
 * Tests the context formatting utilities that format documents
 * and sources for LLM context
 */

import { describe, it, expect } from 'vitest';

import {
  formatContext,
  formatSources,
  deduplicateDocuments,
} from '../../utils/rag/contextFormatter.js';

describe('Context Formatter', () => {
  // ============================================================================
  // formatContext tests
  // ============================================================================
  describe('formatContext', () => {
    it('should format single document with title', () => {
      const docs = [
        {
          pageContent: 'This is the content',
          metadata: { documentTitle: 'Test Document' },
        },
      ];

      const result = formatContext(docs);

      expect(result).toContain('[Source 1: Test Document]');
      expect(result).toContain('This is the content');
    });

    it('should format document with section', () => {
      const docs = [
        {
          pageContent: 'Section content',
          metadata: {
            documentTitle: 'Main Document',
            section: 'Introduction',
          },
        },
      ];

      const result = formatContext(docs);

      expect(result).toContain('[Source 1: Main Document - Introduction]');
    });

    it('should not include "General" section in header', () => {
      const docs = [
        {
          pageContent: 'Content',
          metadata: {
            documentTitle: 'Document',
            section: 'General',
          },
        },
      ];

      const result = formatContext(docs);

      expect(result).toBe('[Source 1: Document]\nContent');
    });

    it('should use "Untitled" for documents without title', () => {
      const docs = [
        {
          pageContent: 'Content without title',
          metadata: {},
        },
      ];

      const result = formatContext(docs);

      expect(result).toContain('[Source 1: Untitled]');
    });

    it('should number multiple documents sequentially', () => {
      const docs = [
        { pageContent: 'First content', metadata: { documentTitle: 'Doc 1' } },
        { pageContent: 'Second content', metadata: { documentTitle: 'Doc 2' } },
        { pageContent: 'Third content', metadata: { documentTitle: 'Doc 3' } },
      ];

      const result = formatContext(docs);

      expect(result).toContain('[Source 1: Doc 1]');
      expect(result).toContain('[Source 2: Doc 2]');
      expect(result).toContain('[Source 3: Doc 3]');
    });

    it('should separate documents with dividers', () => {
      const docs = [
        { pageContent: 'First', metadata: { documentTitle: 'Doc 1' } },
        { pageContent: 'Second', metadata: { documentTitle: 'Doc 2' } },
      ];

      const result = formatContext(docs);

      expect(result).toContain('\n\n---\n\n');
    });

    it('should handle empty array', () => {
      const result = formatContext([]);
      expect(result).toBe('');
    });
  });

  // ============================================================================
  // formatSources tests
  // ============================================================================
  describe('formatSources', () => {
    it('should format source with all metadata', () => {
      const docs = [
        {
          pageContent: 'Content',
          rrfScore: 0.8567,
          metadata: {
            documentTitle: 'Test Doc',
            documentUrl: 'https://example.com/doc',
            section: 'Section 1',
            documentType: 'page',
            block_type: 'paragraph',
            heading_path: ['Chapter 1', 'Section A'],
            positionPercent: 25,
          },
        },
      ];

      const result = formatSources(docs);

      expect(result[0]).toEqual({
        sourceNumber: 1,
        title: 'Test Doc',
        url: 'https://example.com/doc',
        section: 'Section 1',
        type: 'page',
        relevanceScore: '0.8567',
        chunkInfo: {
          blockType: 'paragraph',
          headingPath: ['Chapter 1', 'Section A'],
          position: 25,
        },
      });
    });

    it('should use fallback source URL', () => {
      const docs = [
        {
          pageContent: 'Content',
          metadata: {
            documentTitle: 'Test',
            source: '/path/to/doc',
          },
        },
      ];

      const result = formatSources(docs);

      expect(result[0].url).toBe('/path/to/doc');
    });

    it('should handle missing metadata', () => {
      const docs = [
        {
          pageContent: 'Content',
          metadata: {},
        },
      ];

      const result = formatSources(docs);

      expect(result[0]).toEqual({
        sourceNumber: 1,
        title: 'Untitled',
        url: '',
        section: null,
        type: 'page',
        relevanceScore: null,
        chunkInfo: {
          blockType: null,
          headingPath: [],
          position: null,
        },
      });
    });

    it('should use document score when rrfScore not available', () => {
      const docs = [
        {
          pageContent: 'Content',
          score: 0.75,
          metadata: { documentTitle: 'Test' },
        },
      ];

      const result = formatSources(docs);

      expect(result[0].relevanceScore).toBe('0.7500');
    });

    it('should number multiple sources sequentially', () => {
      const docs = [
        { pageContent: 'A', metadata: { documentTitle: 'Doc A' } },
        { pageContent: 'B', metadata: { documentTitle: 'Doc B' } },
        { pageContent: 'C', metadata: { documentTitle: 'Doc C' } },
      ];

      const result = formatSources(docs);

      expect(result[0].sourceNumber).toBe(1);
      expect(result[1].sourceNumber).toBe(2);
      expect(result[2].sourceNumber).toBe(3);
    });

    it('should handle empty array', () => {
      const result = formatSources([]);
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // deduplicateDocuments tests
  // ============================================================================
  describe('deduplicateDocuments', () => {
    it('should remove duplicate documents by content', () => {
      const docs = [
        { pageContent: 'Same content here and more text', metadata: { id: 1 } },
        { pageContent: 'Same content here and more text', metadata: { id: 2 } },
        { pageContent: 'Different content here', metadata: { id: 3 } },
      ];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(2);
      expect(result[0].metadata.id).toBe(1); // First occurrence preserved
    });

    it('should preserve first occurrence', () => {
      // Use identical first 100 characters to trigger deduplication
      const sharedPrefix =
        'This is the exact same content that will be used as the fingerprint for deduplication purposes.';
      const docs = [
        { pageContent: sharedPrefix + ' Appendix A', metadata: { source: 'A' } },
        { pageContent: sharedPrefix + ' Appendix B', metadata: { source: 'B' } },
      ];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.source).toBe('A');
    });

    it('should use first 100 characters for fingerprint', () => {
      const prefix = 'a'.repeat(100);
      const docs = [
        { pageContent: prefix + 'AAA', metadata: {} },
        { pageContent: prefix + 'BBB', metadata: {} }, // Same first 100 chars
        { pageContent: 'b'.repeat(100) + 'CCC', metadata: {} }, // Different
      ];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = deduplicateDocuments([]);
      expect(result).toEqual([]);
    });

    it('should handle single document', () => {
      const docs = [{ pageContent: 'Single doc', metadata: {} }];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(1);
    });

    it('should handle all unique documents', () => {
      const docs = [
        { pageContent: 'First unique document', metadata: {} },
        { pageContent: 'Second unique document', metadata: {} },
        { pageContent: 'Third unique document', metadata: {} },
      ];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(3);
    });

    it('should handle short documents correctly', () => {
      const docs = [
        { pageContent: 'Short', metadata: { id: 1 } },
        { pageContent: 'Short', metadata: { id: 2 } },
        { pageContent: 'Other', metadata: { id: 3 } },
      ];

      const result = deduplicateDocuments(docs);

      expect(result).toHaveLength(2);
    });
  });
});

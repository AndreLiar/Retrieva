/**
 * Chunk Filter Unit Tests
 * Tests for post-rerank chunk quality filtering (Phase 4 + Phase 5)
 *
 * Phase 5 additions:
 * - Code chunk filtering based on query intent
 *
 * @module tests/unittest/chunkFilter.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Chunk Filter', () => {
  let filterLowQualityChunks;
  const originalEnv = process.env.ENABLE_CHUNK_FILTER;
  const originalCodeFilterEnv = process.env.ENABLE_CODE_FILTER;

  beforeEach(async () => {
    vi.resetModules();
    // Default to enabled
    process.env.ENABLE_CHUNK_FILTER = 'true';
    process.env.ENABLE_CODE_FILTER = 'true';
    // Re-import after resetting modules to get fresh env reading
    const module = await import('../../services/rag/chunkFilter.js');
    filterLowQualityChunks = module.filterLowQualityChunks;
  });

  afterEach(() => {
    process.env.ENABLE_CHUNK_FILTER = originalEnv;
    process.env.ENABLE_CODE_FILTER = originalCodeFilterEnv;
    vi.clearAllMocks();
  });

  const createDoc = (content, headingPath = ['Section'], metadata = {}) => ({
    pageContent: content,
    metadata: {
      heading_path: headingPath,
      ...metadata,
    },
  });

  describe('kill-switch behavior', () => {
    it('should return all docs unchanged when ENABLE_CHUNK_FILTER=false', async () => {
      vi.resetModules();
      process.env.ENABLE_CHUNK_FILTER = 'false';
      const module = await import('../../services/rag/chunkFilter.js');
      const filter = module.filterLowQualityChunks;

      const docs = [
        createDoc('tiny', ['A']), // Would normally be filtered
        createDoc('[Table of Contents]', ['B']), // Junk pattern
        createDoc('This is normal content with enough tokens to pass the threshold', ['C']),
      ];

      const result = filter(docs);

      expect(result).toHaveLength(3);
      expect(result).toEqual(docs);
    });

    it('should filter docs when ENABLE_CHUNK_FILTER=true', () => {
      // Both docs share same heading - so tiny doc is NOT sole representative
      const docs = [
        createDoc('tiny', ['SharedSection'], { estimatedTokens: 10 }), // Too small
        createDoc('This is a longer content that should definitely pass the token threshold check', ['SharedSection']),
      ];

      const result = filterLowQualityChunks(docs);

      // Small doc should be filtered, larger doc should remain
      expect(result.length).toBeLessThan(docs.length);
    });
  });

  describe('token threshold filtering', () => {
    it('should drop docs with <50 tokens estimated from metadata', () => {
      // Both docs share same heading - so tiny doc is NOT sole representative
      const docs = [
        createDoc('short content', ['SharedSection'], { estimatedTokens: 20 }),
        createDoc('This content has plenty of tokens to meet the threshold', ['SharedSection'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.estimatedTokens).toBe(100);
    });

    it('should estimate tokens as text.length/4 when metadata is missing', () => {
      // 200 chars / 4 = 50 tokens (exactly at threshold)
      const content200Chars = 'a'.repeat(200);
      // 100 chars / 4 = 25 tokens (below threshold)
      const content100Chars = 'b'.repeat(100);

      // Both docs share same heading - so tiny doc is NOT sole representative
      const docs = [
        createDoc(content100Chars, ['SharedSection']), // ~25 tokens, should be filtered
        createDoc(content200Chars, ['SharedSection']), // ~50 tokens, should pass
      ];

      const result = filterLowQualityChunks(docs);

      // 100-char doc should be filtered, 200-char doc should remain
      expect(result).toHaveLength(1);
      expect(result[0].pageContent).toBe(content200Chars);
    });

    it('should keep docs with exactly 50 tokens', () => {
      const docs = [
        createDoc('a'.repeat(200), ['A']), // Exactly 50 tokens
        createDoc('b'.repeat(300), ['B']), // 75 tokens
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(2);
    });
  });

  describe('junk pattern detection', () => {
    it('should drop docs matching [Table of Contents] pattern', () => {
      const docs = [
        createDoc('[Table of Contents]', ['A']),
        createDoc('Normal content that is long enough to pass the threshold test', ['B']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).not.toContain('[Table of Contents]');
    });

    it('should drop docs matching [Breadcrumb] pattern', () => {
      const docs = [
        createDoc('[Breadcrumb] Home > Products > Guide', ['A']),
        createDoc('Actual helpful content that passes the token threshold check', ['B']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).not.toContain('[Breadcrumb]');
    });

    it('should drop docs that are just separator lines', () => {
      const docs = [
        createDoc('---', ['A']),
        createDoc('---\n---\n---', ['B']),
        createDoc('Meaningful content here that definitely passes the threshold', ['C']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).toContain('Meaningful content');
    });

    it('should drop docs matching [Link to page] pattern', () => {
      const docs = [
        createDoc('[Link to page] Some external link reference', ['A']),
        createDoc('Proper documentation content that has enough tokens to pass', ['B']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).not.toContain('[Link to page]');
    });

    it('should handle multiple junk patterns in same doc set', () => {
      const docs = [
        createDoc('[Table of Contents]', ['A']),
        createDoc('[Breadcrumb] nav > path', ['B']),
        createDoc('---', ['C']),
        createDoc('[Link to page]', ['D']),
        createDoc('Good content that should remain after filtering junk', ['E']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).toContain('Good content');
    });
  });

  describe('diversity preservation', () => {
    it('should never drop sole representative of a unique heading_path[0]', () => {
      const docs = [
        createDoc('tiny', ['UniqueSection'], { estimatedTokens: 10 }), // Sole representative
        createDoc('another tiny chunk', ['AnotherSection'], { estimatedTokens: 15 }),
        createDoc('long enough content to pass the token threshold test', ['AnotherSection'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs);

      // UniqueSection's tiny doc should be preserved (sole representative)
      const uniqueSectionDoc = result.find(
        (d) => d.metadata?.heading_path?.[0] === 'UniqueSection'
      );
      expect(uniqueSectionDoc).toBeDefined();
    });

    it('should filter tiny docs if section has other representatives', () => {
      const docs = [
        createDoc('tiny', ['SharedSection'], { estimatedTokens: 10 }),
        createDoc('Long enough content that passes threshold in shared section', ['SharedSection'], { estimatedTokens: 100 }),
        createDoc('Another good doc in different section that also passes', ['OtherSection'], { estimatedTokens: 80 }),
      ];

      const result = filterLowQualityChunks(docs);

      // Tiny doc can be filtered because SharedSection has another representative
      expect(result).toHaveLength(2);
      const contents = result.map((d) => d.pageContent);
      expect(contents).not.toContain('tiny');
    });

    it('should handle docs with missing heading_path gracefully', () => {
      const docs = [
        { pageContent: 'Content without heading path that is long enough', metadata: {} },
        createDoc('Content with heading path that passes threshold test', ['Section']),
      ];

      const result = filterLowQualityChunks(docs);

      // Should not throw, both docs are large enough
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('minimum output guarantee', () => {
    it('should always return at least 1 doc even if all are low quality', () => {
      const docs = [
        createDoc('[Table of Contents]', ['A']),
        createDoc('---', ['B']),
        createDoc('tiny', ['C'], { estimatedTokens: 5 }),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
    });

    it('should return best-scoring doc as fallback when all filtered', () => {
      const docs = [
        createDoc('[Table of Contents]', ['A'], { score: 0.5 }),
        createDoc('---', ['B'], { score: 0.8 }),
        createDoc('tiny', ['C'], { estimatedTokens: 5, score: 0.9 }),
      ];

      const result = filterLowQualityChunks(docs);

      // Should return the doc with highest score
      expect(result).toHaveLength(1);
      expect(result[0].metadata.score).toBe(0.9);
    });

    it('should return first doc as fallback when no scores available', () => {
      const docs = [
        createDoc('[Table of Contents]', ['A']),
        createDoc('---', ['B']),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).toBe('[Table of Contents]');
    });
  });

  describe('normal operation', () => {
    it('should pass through normal-sized docs unchanged', () => {
      const docs = [
        createDoc('This is a perfectly normal document with plenty of content', ['A'], { estimatedTokens: 150 }),
        createDoc('Another normal document that should pass all quality checks', ['B'], { estimatedTokens: 200 }),
        createDoc('Third document with good content and sufficient length', ['C'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result).toHaveLength(3);
      expect(result).toEqual(docs);
    });

    it('should handle empty input array', () => {
      const result = filterLowQualityChunks([]);

      expect(result).toEqual([]);
    });

    it('should preserve document order for passing docs', () => {
      const docs = [
        createDoc('First doc content with enough tokens to pass through', ['A'], { estimatedTokens: 100 }),
        createDoc('Second doc content also with sufficient token count', ['B'], { estimatedTokens: 100 }),
        createDoc('Third doc content meeting all the quality criteria', ['C'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result[0].pageContent).toContain('First');
      expect(result[1].pageContent).toContain('Second');
      expect(result[2].pageContent).toContain('Third');
    });

    it('should preserve all metadata on filtered docs', () => {
      const docs = [
        createDoc('Good content that passes all filters easily', ['Section'], {
          estimatedTokens: 100,
          documentTitle: 'Test Doc',
          sourceId: 'abc123',
          customField: 'preserved',
        }),
      ];

      const result = filterLowQualityChunks(docs);

      expect(result[0].metadata.documentTitle).toBe('Test Doc');
      expect(result[0].metadata.sourceId).toBe('abc123');
      expect(result[0].metadata.customField).toBe('preserved');
    });
  });

  describe('options parameter', () => {
    it('should accept options parameter for future extensibility', () => {
      const docs = [
        createDoc('Content that is long enough to pass the quality filter', ['A']),
      ];

      // Should not throw when options are passed
      const result = filterLowQualityChunks(docs, { someOption: true });

      expect(result).toHaveLength(1);
    });
  });

  describe('Phase 5: Code Chunk Filtering', () => {
    const createCodeDoc = (content, headingPath = ['Code'], metadata = {}) => ({
      pageContent: content,
      metadata: {
        heading_path: headingPath,
        is_code: true,
        code_language: 'javascript',
        estimatedTokens: 100,
        ...metadata,
      },
    });

    it('should filter code chunks when query has no programming keywords', () => {
      const docs = [
        createCodeDoc('function authenticate() { return true; }', ['Auth']),
        createDoc('The approval rules require two signatures for invoices over $1000', ['Finance'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs, { query: 'What are the approval rules?' });

      // Code doc should be filtered for non-programming query
      expect(result).toHaveLength(1);
      expect(result[0].metadata.is_code).toBeFalsy();
    });

    it('should include code chunks when query mentions programming', () => {
      const docs = [
        createCodeDoc('function authenticate() { return jwt.verify(token); }', ['Auth']),
        createDoc('Regular documentation content with enough tokens to pass', ['Docs'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs, { query: 'Show me the Python authentication code' });

      // Code doc should be included for programming query
      expect(result).toHaveLength(2);
    });

    it('should include code chunks for "implementation" queries', () => {
      const docs = [
        createCodeDoc('async function fetchData() { return await api.get(); }', ['API']),
        createDoc('Overview of the API endpoint structure documentation here', ['Overview'], { estimatedTokens: 100 }),
      ];

      const result = filterLowQualityChunks(docs, { query: 'How is the API implemented?' });

      // "implement" keyword should include code
      expect(result).toHaveLength(2);
      expect(result.some(d => d.metadata.is_code)).toBe(true);
    });

    it('should include code chunks for "how to" queries', () => {
      const docs = [
        createCodeDoc('const config = { timeout: 5000 };', ['Config']),
      ];

      const result = filterLowQualityChunks(docs, { query: 'How to configure the timeout?' });

      expect(result).toHaveLength(1);
    });

    it('should include code chunks for "example" queries', () => {
      const docs = [
        createCodeDoc('// Example usage\nconst client = new Client();', ['Examples']),
      ];

      const result = filterLowQualityChunks(docs, { query: 'Show me an example of client usage' });

      expect(result).toHaveLength(1);
    });

    it('should include code chunks for language-specific queries', () => {
      const docs = [
        createCodeDoc('def main(): print("Hello")', ['Python']),
      ];

      const queries = [
        'How does the JavaScript authentication work?',
        'Show me the Python script',
        'What does the SQL query do?',
        'Explain the bash command',
      ];

      for (const query of queries) {
        vi.resetModules();
        process.env.ENABLE_CHUNK_FILTER = 'true';
        process.env.ENABLE_CODE_FILTER = 'true';
        const module = require('../../services/rag/chunkFilter.js');
        const result = module.filterLowQualityChunks(docs, { query });
        expect(result.length).toBe(1);
      }
    });

    it('should respect ENABLE_CODE_FILTER=false kill-switch', async () => {
      vi.resetModules();
      process.env.ENABLE_CHUNK_FILTER = 'true';
      process.env.ENABLE_CODE_FILTER = 'false';
      const module = await import('../../services/rag/chunkFilter.js');
      const filter = module.filterLowQualityChunks;

      const docs = [
        createCodeDoc('function test() {}', ['Code']),
        createDoc('Regular content that passes the quality checks', ['Docs'], { estimatedTokens: 100 }),
      ];

      // Even non-programming query should include code when filter is disabled
      const result = filter(docs, { query: 'What are the approval rules?' });

      expect(result).toHaveLength(2);
    });

    it('should include code chunks when no query is provided', () => {
      const docs = [
        createCodeDoc('const x = 1;', ['Code']),
        createDoc('Regular content for testing purposes here', ['Docs'], { estimatedTokens: 100 }),
      ];

      // No query = default to including code
      const result = filterLowQualityChunks(docs, {});

      expect(result).toHaveLength(2);
    });

    it('should correctly identify non-code docs with is_code=false', () => {
      const docs = [
        createDoc('function keyword in plain text should not trigger code filter', ['Docs'], {
          estimatedTokens: 100,
          is_code: false,
        }),
      ];

      const result = filterLowQualityChunks(docs, { query: 'What is the process?' });

      // is_code: false should not be filtered as code
      expect(result).toHaveLength(1);
    });

    it('should handle mixed code and non-code docs correctly', () => {
      const docs = [
        createCodeDoc('async function login() { /* auth */ }', ['Auth']),
        createDoc('Finance policy requires approval', ['Finance'], { estimatedTokens: 100 }),
        createCodeDoc('const calculateTax = () => {}', ['Tax']),
        createDoc('HR onboarding checklist for new employees', ['HR'], { estimatedTokens: 100 }),
      ];

      // Non-programming query
      const result = filterLowQualityChunks(docs, { query: 'What is the HR policy?' });

      // Only non-code docs should remain
      expect(result.every(d => !d.metadata.is_code)).toBe(true);
    });
  });
});

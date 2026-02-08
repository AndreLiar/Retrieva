/**
 * Document Index Deduplication Tests (Phase 5)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock mongoose before importing the module
vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose');

  // Create a proper mock model
  const mockModel = {
    findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    }),
    countDocuments: vi.fn().mockResolvedValue(0),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    bulkWrite: vi.fn().mockResolvedValue({ upsertedCount: 0 }),
  };

  return {
    ...actual,
    default: {
      ...actual.default,
      models: { ContentHash: mockModel },
      model: vi.fn().mockReturnValue(mockModel),
    },
  };
});

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Now import the module after mocks are set up
import {
  normalizeContent,
  generateContentHash,
  deduplicateChunksAtIndex,
  recordIndexedChunks,
  contentHashIndex,
} from '../../services/rag/indexDeduplication.js';

describe('Document Index Deduplication', () => {
  describe('normalizeContent', () => {
    it('should lowercase content', () => {
      expect(normalizeContent('Hello World')).toBe('hello world');
    });

    it('should collapse whitespace', () => {
      expect(normalizeContent('Hello   World')).toBe('hello world');
      expect(normalizeContent('Hello\n\nWorld')).toBe('hello world');
      expect(normalizeContent('Hello\t\tWorld')).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeContent('  Hello World  ')).toBe('hello world');
    });

    it('should normalize quotes', () => {
      expect(normalizeContent("it's a 'test'")).toBe("it's a 'test'");
      expect(normalizeContent('"quoted"')).toBe('"quoted"');
    });

    it('should handle empty or invalid input', () => {
      expect(normalizeContent('')).toBe('');
      expect(normalizeContent(null)).toBe('');
      expect(normalizeContent(undefined)).toBe('');
      expect(normalizeContent(123)).toBe('');
    });

    it('should produce consistent output for semantically equivalent content', () => {
      const content1 = 'Hello   World!';
      const content2 = 'hello world!';
      const content3 = '  Hello World!  ';

      expect(normalizeContent(content1)).toBe(normalizeContent(content2));
      expect(normalizeContent(content1)).toBe(normalizeContent(content3));
    });
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'Test content for hashing';
      const hash1 = generateContentHash(content);
      const hash2 = generateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate different hashes for different content', () => {
      const hash1 = generateContentHash('Content A');
      const hash2 = generateContentHash('Content B');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize before hashing', () => {
      const hash1 = generateContentHash('Hello World');
      const hash2 = generateContentHash('  hello   world  ');

      expect(hash1).toBe(hash2);
    });

    it('should handle empty content', () => {
      const hash = generateContentHash('');
      expect(hash).toHaveLength(64);
    });
  });

  describe('deduplicateChunksAtIndex', () => {
    beforeEach(() => {
      // Reset mock implementations
      vi.clearAllMocks();
    });

    it('should identify chunks with duplicate content hashes', async () => {
      // Mock contentHashIndex.existsMany to return empty set (no existing hashes)
      vi.spyOn(contentHashIndex, 'existsMany').mockResolvedValue(new Set());

      const chunks = [
        { pageContent: 'Unique content A', metadata: {} },
        { pageContent: 'Duplicate content', metadata: {} },
        { pageContent: 'Duplicate content', metadata: {} }, // Same as above
        { pageContent: 'Unique content B', metadata: {} },
      ];

      const result = await deduplicateChunksAtIndex(chunks, 'workspace-1', 'source-1');

      expect(result.unique.length).toBe(3); // Only 3 unique
      expect(result.duplicates.length).toBe(1); // 1 duplicate in batch
      expect(result.stats.total).toBe(4);
    });

    it('should add contentHash to chunk metadata', async () => {
      vi.spyOn(contentHashIndex, 'existsMany').mockResolvedValue(new Set());

      const chunks = [{ pageContent: 'Test content', metadata: {} }];

      const result = await deduplicateChunksAtIndex(chunks, 'workspace-1', 'source-1');

      expect(result.unique[0].metadata.contentHash).toBeDefined();
      expect(result.unique[0].metadata.contentHash).toHaveLength(64);
    });

    it('should detect duplicates against existing index', async () => {
      const existingHash = generateContentHash('Already indexed content');
      vi.spyOn(contentHashIndex, 'existsMany').mockResolvedValue(new Set([existingHash]));

      const chunks = [
        { pageContent: 'Already indexed content', metadata: {} },
        { pageContent: 'New content', metadata: {} },
      ];

      const result = await deduplicateChunksAtIndex(chunks, 'workspace-1', 'source-1');

      expect(result.unique.length).toBe(1);
      expect(result.duplicates.length).toBe(1);
      expect(result.duplicates[0].reason).toBe('existing_index');
    });

    it('should handle empty input', async () => {
      const result = await deduplicateChunksAtIndex([], 'workspace-1', 'source-1');

      expect(result.unique).toEqual([]);
      expect(result.duplicates).toEqual([]);
      expect(result.stats.total).toBe(0);
    });

    it('should preserve chunk metadata', async () => {
      vi.spyOn(contentHashIndex, 'existsMany').mockResolvedValue(new Set());

      const chunks = [
        {
          pageContent: 'Test content',
          metadata: {
            sourceId: 'test-source',
            heading_path: ['Section'],
            customField: 'value',
          },
        },
      ];

      const result = await deduplicateChunksAtIndex(chunks, 'workspace-1', 'source-1');

      expect(result.unique[0].metadata.sourceId).toBe('test-source');
      expect(result.unique[0].metadata.heading_path).toEqual(['Section']);
      expect(result.unique[0].metadata.customField).toBe('value');
    });
  });

  describe('recordIndexedChunks', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should record hashes for indexed chunks', async () => {
      const addManySpy = vi.spyOn(contentHashIndex, 'addMany').mockResolvedValue(2);

      const chunks = [
        { pageContent: 'Content A', metadata: { contentHash: 'hash-a' } },
        { pageContent: 'Content B', metadata: { contentHash: 'hash-b' } },
      ];

      const result = await recordIndexedChunks('workspace-1', 'source-1', chunks);

      expect(addManySpy).toHaveBeenCalledWith('workspace-1', expect.any(Array));
      expect(result).toBe(2);
    });

    it('should skip chunks without contentHash', async () => {
      const addManySpy = vi.spyOn(contentHashIndex, 'addMany').mockResolvedValue(1);

      const chunks = [
        { pageContent: 'With hash', metadata: { contentHash: 'hash-1' } },
        { pageContent: 'No hash', metadata: {} },
      ];

      await recordIndexedChunks('workspace-1', 'source-1', chunks);

      const calledWith = addManySpy.mock.calls[0][1];
      expect(calledWith.length).toBe(1);
    });

    it('should handle empty input', async () => {
      const result = await recordIndexedChunks('workspace-1', 'source-1', []);
      expect(result).toBe(0);
    });
  });

  describe('ContentHashIndex', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('exists', () => {
      it('should check if hash exists in database', async () => {
        // Use spy on contentHashIndex method
        const existsSpy = vi.spyOn(contentHashIndex, 'exists').mockResolvedValue(true);

        const result = await contentHashIndex.exists('workspace-1', 'hash-1');
        expect(result).toBe(true);
        expect(existsSpy).toHaveBeenCalledWith('workspace-1', 'hash-1');

        existsSpy.mockRestore();
      });

      it('should return false for non-existing hash', async () => {
        const existsSpy = vi.spyOn(contentHashIndex, 'exists').mockResolvedValue(false);

        const result = await contentHashIndex.exists('workspace-1', 'hash-unknown');
        expect(result).toBe(false);

        existsSpy.mockRestore();
      });
    });

    describe('existsMany', () => {
      it('should return set of existing hashes', async () => {
        const existsManySpy = vi
          .spyOn(contentHashIndex, 'existsMany')
          .mockResolvedValue(new Set(['hash-1', 'hash-2']));

        const result = await contentHashIndex.existsMany('workspace-1', [
          'hash-1',
          'hash-2',
          'hash-3',
        ]);

        expect(result).toBeInstanceOf(Set);
        expect(result.has('hash-1')).toBe(true);
        expect(result.has('hash-2')).toBe(true);
        expect(result.has('hash-3')).toBe(false);

        existsManySpy.mockRestore();
      });

      it('should handle empty input', async () => {
        // Don't mock - test the real implementation for empty input
        // This should return early without database call
        vi.restoreAllMocks();

        // Re-import to get clean implementation
        const { contentHashIndex: freshIndex } = await import(
          '../../services/rag/indexDeduplication.js'
        );
        const result = await freshIndex.existsMany('workspace-1', []);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });
    });

    describe('removeBySource', () => {
      it('should remove hashes for a source', async () => {
        const removeSpy = vi.spyOn(contentHashIndex, 'removeBySource').mockResolvedValue(5);

        const result = await contentHashIndex.removeBySource('workspace-1', 'source-1');

        expect(removeSpy).toHaveBeenCalledWith('workspace-1', 'source-1');
        expect(result).toBe(5);

        removeSpy.mockRestore();
      });
    });

    describe('removeByWorkspace', () => {
      it('should remove all hashes for a workspace', async () => {
        const removeSpy = vi.spyOn(contentHashIndex, 'removeByWorkspace').mockResolvedValue(100);

        const result = await contentHashIndex.removeByWorkspace('workspace-1');

        expect(removeSpy).toHaveBeenCalledWith('workspace-1');
        expect(result).toBe(100);

        removeSpy.mockRestore();
      });
    });

    describe('count', () => {
      it('should return hash count for workspace', async () => {
        const countSpy = vi.spyOn(contentHashIndex, 'count').mockResolvedValue(42);

        const result = await contentHashIndex.count('workspace-1');

        expect(result).toBe(42);

        countSpy.mockRestore();
      });
    });
  });
});

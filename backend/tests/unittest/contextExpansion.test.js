import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  expandDocumentContext,
  mergeExpandedChunks,
  EXPANSION_CONFIG,
} from '../../services/rag/contextExpansion.js';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Qdrant client
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    scroll: vi.fn().mockResolvedValue({ points: [] }),
    retrieve: vi.fn().mockResolvedValue([]),
  })),
}));

describe('Context Expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EXPANSION_CONFIG', () => {
    it('should have default configuration values', () => {
      expect(EXPANSION_CONFIG.siblingWindowSize).toBeGreaterThanOrEqual(1);
      expect(EXPANSION_CONFIG.maxChunksPerSource).toBeGreaterThan(0);
      expect(typeof EXPANSION_CONFIG.enabled).toBe('boolean');
    });
  });

  describe('expandDocumentContext', () => {
    it('should return original documents when expansion is disabled', async () => {
      const originalEnabled = EXPANSION_CONFIG.enabled;
      EXPANSION_CONFIG.enabled = false;

      const docs = [
        { pageContent: 'Test content', metadata: { sourceId: 'source1' } },
      ];

      const result = await expandDocumentContext(docs, 'workspace1');

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].isOriginal).toBe(true);
      expect(result.metrics.expanded).toBe(false);

      EXPANSION_CONFIG.enabled = originalEnabled;
    });

    it('should return empty result for empty input', async () => {
      const result = await expandDocumentContext([], 'workspace1');

      expect(result.chunks).toHaveLength(0);
      expect(result.metrics.originalCount).toBe(0);
    });

    it('should mark original documents correctly', async () => {
      const docs = [
        { pageContent: 'Content 1', metadata: { sourceId: 'src1', chunkIndex: 0 } },
        { pageContent: 'Content 2', metadata: { sourceId: 'src2', chunkIndex: 1 } },
      ];

      const result = await expandDocumentContext(docs, 'workspace1');

      const originals = result.chunks.filter((c) => c.isOriginal);
      expect(originals.length).toBeGreaterThanOrEqual(2);
    });

    it('should include metrics in result', async () => {
      const docs = [
        { pageContent: 'Test content', metadata: { sourceId: 'source1' } },
      ];

      const result = await expandDocumentContext(docs, 'workspace1');

      expect(result.metrics).toHaveProperty('originalCount');
      expect(result.metrics).toHaveProperty('expandedCount');
      expect(result.metrics).toHaveProperty('totalChunks');
      expect(result.metrics).toHaveProperty('processingTimeMs');
    });
  });

  describe('mergeExpandedChunks', () => {
    it('should group chunks by source', () => {
      const chunks = [
        { pageContent: 'Chunk 1', metadata: { sourceId: 'src1' }, position: 0, isOriginal: true },
        { pageContent: 'Chunk 2', metadata: { sourceId: 'src1' }, position: 1, isOriginal: false },
        { pageContent: 'Chunk 3', metadata: { sourceId: 'src2' }, position: 0, isOriginal: true },
      ];

      const merged = mergeExpandedChunks(chunks);

      expect(merged).toHaveLength(2);
    });

    it('should combine content within each group', () => {
      const chunks = [
        { pageContent: 'First part.', metadata: { sourceId: 'src1' }, position: 0, isOriginal: true },
        { pageContent: 'Second part.', metadata: { sourceId: 'src1' }, position: 1, isOriginal: false },
      ];

      const merged = mergeExpandedChunks(chunks);

      expect(merged[0].pageContent).toContain('First part.');
      expect(merged[0].pageContent).toContain('Second part.');
    });

    it('should sort chunks by position within each group', () => {
      const chunks = [
        { pageContent: 'Second', metadata: { sourceId: 'src1' }, position: 2, isOriginal: false },
        { pageContent: 'First', metadata: { sourceId: 'src1' }, position: 1, isOriginal: true },
        { pageContent: 'Third', metadata: { sourceId: 'src1' }, position: 3, isOriginal: false },
      ];

      const merged = mergeExpandedChunks(chunks);

      expect(merged[0].pageContent).toMatch(/First[\s\S]*Second[\s\S]*Third/);
    });

    it('should mark merged documents as expanded', () => {
      const chunks = [
        { pageContent: 'Part 1', metadata: { sourceId: 'src1' }, position: 0, isOriginal: true },
        { pageContent: 'Part 2', metadata: { sourceId: 'src1' }, position: 1, isOriginal: false },
      ];

      const merged = mergeExpandedChunks(chunks);

      expect(merged[0].metadata.isExpanded).toBe(true);
      expect(merged[0].metadata.chunkCount).toBe(2);
    });

    it('should handle single-chunk sources', () => {
      const chunks = [
        { pageContent: 'Single', metadata: { sourceId: 'src1' }, position: 0, isOriginal: true },
      ];

      const merged = mergeExpandedChunks(chunks);

      expect(merged).toHaveLength(1);
      expect(merged[0].pageContent).toBe('Single');
    });
  });
});

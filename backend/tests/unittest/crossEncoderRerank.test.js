import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  crossEncoderRerank,
  getRerankStatus,
  hybridRerank,
  RERANK_CONFIG,
} from '../../services/rag/crossEncoderRerank.js';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock LLM
vi.mock('../../config/llm.js', () => ({
  getDefaultLLM: vi.fn().mockResolvedValue({
    invoke: vi.fn().mockResolvedValue({
      content: '{"score": 8, "reason": "Highly relevant"}',
    }),
  }),
}));

// Mock prompt template
vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue('{"score": 7, "reason": "Relevant"}'),
        }),
      }),
    }),
  },
}));

// Mock output parser
vi.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: vi.fn().mockImplementation(() => ({})),
}));

describe('Cross-Encoder Re-ranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RERANK_CONFIG', () => {
    it('should have default configuration', () => {
      expect(RERANK_CONFIG).toHaveProperty('provider');
      expect(RERANK_CONFIG).toHaveProperty('topN');
      expect(RERANK_CONFIG).toHaveProperty('minScore');
      expect(RERANK_CONFIG).toHaveProperty('enabled');
    });
  });

  describe('getRerankStatus', () => {
    it('should return current rerank configuration status', () => {
      const status = getRerankStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('provider');
      expect(status).toHaveProperty('topN');
      expect(status).toHaveProperty('minScore');
      expect(typeof status.enabled).toBe('boolean');
    });
  });

  describe('crossEncoderRerank', () => {
    it('should return documents unchanged when reranking is disabled', async () => {
      const originalEnabled = RERANK_CONFIG.enabled;
      RERANK_CONFIG.enabled = false;

      const docs = [
        { pageContent: 'Document 1', metadata: { score: 0.9 } },
        { pageContent: 'Document 2', metadata: { score: 0.8 } },
      ];

      const result = await crossEncoderRerank('test query', docs);

      expect(result.documents).toHaveLength(2);
      expect(result.provider).toBe('none');
      expect(result.success).toBe(true);

      RERANK_CONFIG.enabled = originalEnabled;
    });

    it('should return empty array for empty input', async () => {
      const result = await crossEncoderRerank('test query', []);

      expect(result.documents).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it('should add rerankScore to documents', async () => {
      const originalEnabled = RERANK_CONFIG.enabled;
      const originalProvider = RERANK_CONFIG.provider;
      RERANK_CONFIG.enabled = true;
      RERANK_CONFIG.provider = 'none';

      const docs = [
        { pageContent: 'Document 1', metadata: { score: 0.9 } },
        { pageContent: 'Document 2', metadata: { score: 0.8 } },
      ];

      const result = await crossEncoderRerank('test query', docs);

      expect(result.documents[0]).toHaveProperty('rerankScore');
      expect(result.documents[0]).toHaveProperty('rerankRank');

      RERANK_CONFIG.enabled = originalEnabled;
      RERANK_CONFIG.provider = originalProvider;
    });

    it('should fallback gracefully on error', async () => {
      const originalEnabled = RERANK_CONFIG.enabled;
      const originalProvider = RERANK_CONFIG.provider;
      RERANK_CONFIG.enabled = true;
      RERANK_CONFIG.provider = 'cohere';
      RERANK_CONFIG.cohereApiKey = null; // Will cause error

      const docs = [
        { pageContent: 'Document 1', metadata: { score: 0.9 } },
      ];

      const result = await crossEncoderRerank('test query', docs);

      expect(result.provider).toBe('fallback');
      expect(result.success).toBe(false);
      expect(result.documents).toHaveLength(1);

      RERANK_CONFIG.enabled = originalEnabled;
      RERANK_CONFIG.provider = originalProvider;
    });
  });

  describe('hybridRerank', () => {
    it('should combine RRF and cross-encoder rankings', async () => {
      const originalEnabled = RERANK_CONFIG.enabled;
      RERANK_CONFIG.enabled = false; // Use no cross-encoder for test

      const rrfRankedDocs = [
        { pageContent: 'Doc 1', rrfRank: 1, rrfScore: 0.05, metadata: { score: 0.9 } },
        { pageContent: 'Doc 2', rrfRank: 2, rrfScore: 0.04, metadata: { score: 0.8 } },
        { pageContent: 'Doc 3', rrfRank: 3, rrfScore: 0.03, metadata: { score: 0.7 } },
      ];

      const result = await hybridRerank(rrfRankedDocs, 'test query', {
        crossEncoderTopK: 3,
        finalTopK: 2,
      });

      expect(result.length).toBeLessThanOrEqual(3);
      expect(result[0]).toHaveProperty('combinedScore');
      expect(result[0]).toHaveProperty('rrfRank');

      RERANK_CONFIG.enabled = originalEnabled;
    });

    it('should limit candidates to crossEncoderTopK', async () => {
      const originalEnabled = RERANK_CONFIG.enabled;
      RERANK_CONFIG.enabled = false;

      const rrfRankedDocs = Array.from({ length: 20 }, (_, i) => ({
        pageContent: `Doc ${i + 1}`,
        rrfRank: i + 1,
        rrfScore: 0.05 - i * 0.002,
        metadata: { score: 0.9 - i * 0.02 },
      }));

      const result = await hybridRerank(rrfRankedDocs, 'test query', {
        crossEncoderTopK: 10,
        finalTopK: 5,
      });

      // When cross-encoder is disabled, result length is limited by crossEncoderTopK
      // which is passed to the internal crossEncoderRerank as candidates
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result[0]).toHaveProperty('combinedScore');

      RERANK_CONFIG.enabled = originalEnabled;
    });
  });
});

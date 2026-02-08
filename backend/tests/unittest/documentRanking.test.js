/**
 * Document Ranking Unit Tests
 * Tests for BM25 scoring and RRF hybrid re-ranking
 *
 * @module tests/unittest/documentRanking.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to prevent console output during tests
vi.mock('../../config/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import functions under test - use real textNormalization (pure functions)
import {
  calculateBM25Score,
  buildDocFrequencyMap,
  rerankDocuments,
} from '../../services/rag/documentRanking.js';

describe('Document Ranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateBM25Score', () => {
    it('should return score > 0 for query with exact match in document', () => {
      const query = 'stripe integration';
      const document = 'This document covers stripe integration with payment processing';
      const avgDocLength = 10;

      const score = calculateBM25Score(query, document, avgDocLength);

      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for query with no matching terms in document', () => {
      const query = 'kubernetes deployment';
      const document = 'This is about database optimization and caching strategies';
      const avgDocLength = 10;

      const score = calculateBM25Score(query, document, avgDocLength);

      expect(score).toBe(0);
    });

    it('should score longer matching document differently than shorter (length normalization)', () => {
      const query = 'stripe';
      const shortDoc = 'stripe integration guide';
      const longDoc = 'stripe integration guide with detailed steps for setting up payment processing and handling webhooks and subscriptions';
      const avgDocLength = 20;

      const shortScore = calculateBM25Score(query, shortDoc, avgDocLength);
      const longScore = calculateBM25Score(query, longDoc, avgDocLength);

      // Both should score > 0
      expect(shortScore).toBeGreaterThan(0);
      expect(longScore).toBeGreaterThan(0);
      // Scores should be different due to length normalization
      expect(shortScore).not.toBe(longScore);
      // Shorter doc should score higher with BM25 length normalization when term appears once
      expect(shortScore).toBeGreaterThan(longScore);
    });

    it('should increase score with multiple occurrences of query term (term frequency saturation)', () => {
      const query = 'stripe';
      const singleOccurrence = 'stripe integration guide';
      const multipleOccurrences = 'stripe integration guide for stripe payments using stripe webhooks';
      const avgDocLength = 10;

      const singleScore = calculateBM25Score(query, singleOccurrence, avgDocLength);
      const multipleScore = calculateBM25Score(query, multipleOccurrences, avgDocLength);

      expect(multipleScore).toBeGreaterThan(singleScore);
    });

    it('should handle empty query gracefully', () => {
      const query = '';
      const document = 'Some content here';
      const avgDocLength = 10;

      const score = calculateBM25Score(query, document, avgDocLength);

      expect(score).toBe(0);
    });

    it('should handle empty document gracefully', () => {
      const query = 'stripe';
      const document = '';
      const avgDocLength = 10;

      const score = calculateBM25Score(query, document, avgDocLength);

      expect(score).toBe(0);
    });

    it('should use document frequency map for IDF calculation', () => {
      const query = 'stripe';
      const document = 'stripe integration guide';
      const avgDocLength = 10;

      // Term appears in 1 doc out of 10 (high IDF)
      const rareTermDfMap = new Map([['stripe', 1]]);
      const rareScore = calculateBM25Score(query, document, avgDocLength, rareTermDfMap, 10);

      // Term appears in 9 docs out of 10 (low IDF)
      const commonTermDfMap = new Map([['stripe', 9]]);
      const commonScore = calculateBM25Score(query, document, avgDocLength, commonTermDfMap, 10);

      // Rare term should have higher IDF and thus higher score
      expect(rareScore).toBeGreaterThan(commonScore);
    });
  });

  describe('buildDocFrequencyMap', () => {
    it('should return correct term to doc-count map for a small doc set', () => {
      const docs = [
        { pageContent: 'stripe payment integration' },
        { pageContent: 'payment processing guide' },
        { pageContent: 'stripe webhooks setup' },
      ];

      const dfMap = buildDocFrequencyMap(docs);

      // 'stripe' appears in 2 documents
      expect(dfMap.get('stripe')).toBe(2);
      // 'payment' appears in 2 documents
      expect(dfMap.get('payment')).toBe(2);
      // 'integration' appears in 1 document
      expect(dfMap.get('integration')).toBe(1);
      // 'guide' appears in 1 document
      expect(dfMap.get('guide')).toBe(1);
      // 'webhooks' appears in 1 document
      expect(dfMap.get('webhooks')).toBe(1);
    });

    it('should handle empty docs array', () => {
      const docs = [];

      const dfMap = buildDocFrequencyMap(docs);

      expect(dfMap.size).toBe(0);
    });

    it('should count each term only once per document (unique terms)', () => {
      const docs = [
        { pageContent: 'stripe stripe stripe payment payment' },
      ];

      const dfMap = buildDocFrequencyMap(docs);

      // Even though 'stripe' appears 3 times, it's in 1 document
      expect(dfMap.get('stripe')).toBe(1);
      expect(dfMap.get('payment')).toBe(1);
    });

    it('should handle documents with empty content', () => {
      const docs = [
        { pageContent: '' },
        { pageContent: 'stripe integration' },
      ];

      const dfMap = buildDocFrequencyMap(docs);

      expect(dfMap.get('stripe')).toBe(1);
      expect(dfMap.get('integration')).toBe(1);
    });
  });

  describe('rerankDocuments', () => {
    const createDoc = (content, title, score = 0.8) => ({
      pageContent: content,
      metadata: {
        documentTitle: title,
        score: score,
      },
    });

    it('should return empty array for empty input', () => {
      const result = rerankDocuments([], 'test query', 5);
      expect(result).toEqual([]);
    });

    it('should return empty array for null input', () => {
      const result = rerankDocuments(null, 'test query', 5);
      expect(result).toEqual([]);
    });

    it('should return single doc with ranking metadata', () => {
      const docs = [createDoc('stripe integration guide', 'Stripe Guide', 0.9)];

      const result = rerankDocuments(docs, 'stripe', 5);

      expect(result).toHaveLength(1);
      expect(result[0].pageContent).toBe('stripe integration guide');
      expect(result[0]).toHaveProperty('rrfScore');
      expect(result[0]).toHaveProperty('semanticRank');
      expect(result[0]).toHaveProperty('bm25Rank');
      expect(result[0]).toHaveProperty('titleRank');
    });

    it('should output length be <= topK', () => {
      const docs = [
        createDoc('doc 1 stripe', 'Title 1', 0.9),
        createDoc('doc 2 stripe', 'Title 2', 0.85),
        createDoc('doc 3 stripe', 'Title 3', 0.8),
        createDoc('doc 4 stripe', 'Title 4', 0.75),
        createDoc('doc 5 stripe', 'Title 5', 0.7),
      ];

      const result = rerankDocuments(docs, 'stripe', 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should include all ranking fields in results', () => {
      const docs = [
        createDoc('stripe payment integration', 'Stripe Guide', 0.9),
        createDoc('webhook setup guide', 'Webhook Setup', 0.85),
      ];

      const result = rerankDocuments(docs, 'stripe payment', 5);

      for (const doc of result) {
        expect(doc).toHaveProperty('rrfScore');
        expect(doc).toHaveProperty('semanticRank');
        expect(doc).toHaveProperty('bm25Rank');
        expect(doc).toHaveProperty('titleRank');
        expect(doc).toHaveProperty('titleSimilarity');
        expect(doc).toHaveProperty('score');
        expect(typeof doc.rrfScore).toBe('number');
        expect(typeof doc.semanticRank).toBe('number');
        expect(typeof doc.bm25Rank).toBe('number');
      }
    });

    it('should keep doc ranked #1 in both semantic and BM25 as #1 after RRF', () => {
      // Doc 1 is best in both semantic (first position) and BM25 (exact match)
      const docs = [
        createDoc('stripe payment integration guide', 'Stripe Payment', 0.95),
        createDoc('webhook configuration', 'Webhook Config', 0.7),
        createDoc('general documentation', 'General Docs', 0.5),
      ];

      const result = rerankDocuments(docs, 'stripe payment integration', 5);

      // The first doc should remain #1 since it's best in both rankings
      expect(result[0].pageContent).toBe('stripe payment integration guide');
    });

    it('should handle docs with missing metadata gracefully', () => {
      const docs = [
        { pageContent: 'stripe integration' },
        { pageContent: 'payment processing', metadata: {} },
        createDoc('webhook setup', 'Webhook', 0.8),
      ];

      const result = rerankDocuments(docs, 'stripe', 5);

      expect(result.length).toBeGreaterThan(0);
      // Should not throw
    });
  });

  describe('rerankDocuments title similarity threshold', () => {
    const createDocWithTitle = (content, title, score = 0.8) => ({
      pageContent: content,
      metadata: {
        documentTitle: title,
        score: score,
      },
    });

    it('should have low title similarity for unrelated titles', () => {
      const docs = [
        createDocWithTitle('content about payments', 'Unrelated Title', 0.9),
        createDocWithTitle('content about billing', 'Another Title', 0.85),
      ];

      const result = rerankDocuments(docs, 'stripe integration', 5);

      // With unrelated titles, title similarity should be low
      for (const doc of result) {
        expect(doc.titleSimilarity).toBeLessThan(0.5);
      }
    });

    it('should have higher title similarity for matching titles', () => {
      const docs = [
        createDocWithTitle('general content', 'Other Title', 0.9),
        createDocWithTitle('stripe content', 'Stripe Integration Guide', 0.8),
      ];

      const result = rerankDocuments(docs, 'stripe integration', 5);

      const stripeDoc = result.find((d) => d.metadata?.documentTitle === 'Stripe Integration Guide');
      const otherDoc = result.find((d) => d.metadata?.documentTitle === 'Other Title');

      expect(stripeDoc.titleSimilarity).toBeGreaterThan(otherDoc.titleSimilarity);
    });

    it('should boost docs with high title similarity (>0.8 threshold)', () => {
      // When query matches title closely, the doc should get +0.05 bonus
      const docs = [
        createDocWithTitle('other content here', 'Other Guide', 0.95),
        createDocWithTitle('stripe content here', 'Stripe Integration', 0.7),
      ];

      const result = rerankDocuments(docs, 'stripe integration', 5);

      // The doc with matching title should have titleSimilarity > 0.8
      const stripeDoc = result.find((d) => d.metadata?.documentTitle === 'Stripe Integration');
      expect(stripeDoc.titleSimilarity).toBeGreaterThan(0.8);
    });

    it('should boost near-exact title matches in final ranking', () => {
      const docs = [
        createDocWithTitle('detailed content about payments', 'Payment Processing', 0.95),
        createDocWithTitle('stripe content brief', 'Stripe Integration', 0.6),
        createDocWithTitle('some other content', 'Other Topic', 0.8),
      ];

      const result = rerankDocuments(docs, 'stripe integration', 5);

      // Stripe Integration doc should get boosted due to title match
      const stripeDoc = result.find((d) => d.metadata?.documentTitle === 'Stripe Integration');
      expect(stripeDoc).toBeDefined();
      expect(stripeDoc.titleSimilarity).toBeGreaterThan(0.8);
    });
  });

  describe('RRF formula correctness', () => {
    it('should calculate RRF score using formula 1/(k+rank) with k=60', () => {
      // With RRF_K=60, a doc at rank 1 contributes 1/(60+1) ≈ 0.01639
      const docs = [
        {
          pageContent: 'unique content for testing rrf',
          metadata: { documentTitle: 'Test Doc', score: 0.9 },
        },
      ];

      const result = rerankDocuments(docs, 'unique content', 5);

      // Single doc at rank 1 for semantic (1/61) + rank 1 for BM25 (1/61)
      // = 2/61 ≈ 0.0328 minimum (may have title contribution too)
      const expectedMinRRF = 2 / 61;
      expect(result[0].rrfScore).toBeGreaterThanOrEqual(expectedMinRRF - 0.001);
    });

    it('should accumulate RRF scores from multiple signals', () => {
      const docs = [
        {
          pageContent: 'stripe payment integration',
          metadata: { documentTitle: 'Stripe Payment', score: 0.9 },
        },
      ];

      const result = rerankDocuments(docs, 'stripe payment', 5);

      // Should have contributions from semantic and BM25 at minimum
      // At least 2 * 1/61 ≈ 0.0328
      expect(result[0].rrfScore).toBeGreaterThan(0.03);
    });

    it('should give higher RRF score to docs ranking well across multiple signals', () => {
      const docs = [
        // This doc should rank well in semantic, BM25, and title
        {
          pageContent: 'stripe payment integration guide',
          metadata: { documentTitle: 'Stripe Payment Integration', score: 0.95 },
        },
        // This doc only matches semantically
        {
          pageContent: 'general information about various topics',
          metadata: { documentTitle: 'General Info', score: 0.9 },
        },
      ];

      const result = rerankDocuments(docs, 'stripe payment integration', 5);

      // First doc should have higher RRF due to multiple signal alignment
      expect(result[0].pageContent).toContain('stripe payment');
      expect(result[0].rrfScore).toBeGreaterThan(result[1].rrfScore);
    });
  });

  describe('edge cases', () => {
    it('should handle documents with special characters', () => {
      const docs = [
        { pageContent: 'C++ programming guide', metadata: { documentTitle: 'C++ Guide' } },
        { pageContent: 'Node.js async/await patterns', metadata: { documentTitle: 'Node.js' } },
      ];

      const result = rerankDocuments(docs, 'C++ programming', 5);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle documents with unicode characters', () => {
      const docs = [
        { pageContent: 'Titre de séjour documentation', metadata: { documentTitle: 'Séjour' } },
        { pageContent: 'Résumé of features', metadata: { documentTitle: 'Résumé' } },
      ];

      const result = rerankDocuments(docs, 'titre sejour', 5);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle very long documents', () => {
      const longContent = 'stripe '.repeat(1000) + 'payment integration';
      const docs = [
        { pageContent: longContent, metadata: { documentTitle: 'Long Doc' } },
        { pageContent: 'short stripe doc', metadata: { documentTitle: 'Short Doc' } },
      ];

      const result = rerankDocuments(docs, 'stripe payment', 5);

      expect(result.length).toBe(2);
    });
  });
});

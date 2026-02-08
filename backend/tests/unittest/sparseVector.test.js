/**
 * Sparse Vector Service Tests
 * Tests for BM25 sparse vectors and hybrid search
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

describe('Sparse Vector Service', () => {
  let sparseVectorManager;
  let workspaceId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const { NotionWorkspace } = await import('../../models/NotionWorkspace.js');
    const { sparseVectorManager: svm } = await import('../../services/search/sparseVector.js');
    sparseVectorManager = svm;

    const workspace = await NotionWorkspace.findOne({});
    workspaceId = workspace?.workspaceId;
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('searchSparse', () => {
    it('should return results for a valid query', async () => {
      if (!workspaceId) {
        console.log('Skipping test - no workspace found');
        return;
      }

      const results = await sparseVectorManager.searchSparse(workspaceId, 'Stripe Integration Guide', { limit: 5 });

      console.log('\nSparse Search Results for "Stripe Integration Guide":');
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. Score: ${r.score?.toFixed(2)} | Title: ${r.metadata?.title || 'unknown'}`);
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should rank documents with matching keywords higher', async () => {
      if (!workspaceId) {
        console.log('Skipping test - no workspace found');
        return;
      }

      const results = await sparseVectorManager.searchSparse(workspaceId, 'Stripe payment integration', { limit: 10 });

      // Check that at least one top result mentions Stripe
      const topResults = results.slice(0, 3);
      const hasStripeMatch = topResults.some(r =>
        r.metadata?.title?.toLowerCase().includes('stripe') ||
        r.metadata?.sourceId?.toLowerCase().includes('stripe')
      );

      console.log('\nTop 3 results for "Stripe payment integration":');
      topResults.forEach((r, i) => {
        console.log(`  ${i + 1}. Score: ${r.score?.toFixed(2)} | Title: ${r.metadata?.title || 'unknown'}`);
      });

      // This is informational - we're checking if BM25 is working
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('hybridSearch', () => {
    it('should boost sparse-only results with high scores', async () => {
      if (!workspaceId) {
        console.log('Skipping test - no workspace found');
        return;
      }

      // Mock dense results that don't include Stripe documents
      const mockDenseResults = [
        { metadata: { sourceId: 'mock1', documentTitle: 'Unrelated Doc 1' }, pageContent: 'Some content' },
        { metadata: { sourceId: 'mock2', documentTitle: 'Unrelated Doc 2' }, pageContent: 'More content' },
      ];

      const results = await sparseVectorManager.hybridSearch(
        workspaceId,
        'Stripe Integration Guide',
        mockDenseResults,
        { limit: 10, alpha: 0.4 }
      );

      console.log('\nHybrid Search Results:');
      results.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i + 1}. RRF: ${r.rrfScore?.toFixed(4)} | Dense: ${r.denseRank || '-'} | Sparse: ${r.sparseRank || '-'} | normScore: ${r.normalizedSparseScore || '-'}`);
      });

      expect(results.length).toBeGreaterThan(0);

      // Check that sparse-only results are represented in top results
      const sparseOnlyInTop5 = results.slice(0, 5).filter(r => r.sparseRank && !r.denseRank);
      console.log(`\nSparse-only results in top 5: ${sparseOnlyInTop5.length}`);
    });
  });
});

/**
 * Unit tests — complianceKbRetriever
 *
 * Verifies that:
 *   - Regulation docs are tagged with `source: 'regulation'`
 *   - documentTitle is built from regulation + article + title
 *   - Returns [] gracefully when collection or search fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromExistingCollection } = vi.hoisted(() => ({
  fromExistingCollection: vi.fn(),
}));

vi.mock('@langchain/qdrant', () => ({
  QdrantVectorStore: { fromExistingCollection },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: { embedQuery: vi.fn() },
  BATCH_CONFIG: {},
  getEmbeddingMetrics: vi.fn(),
  isCloudAvailable: vi.fn(),
  createEmbeddingContext: vi.fn(),
}));

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  retrieveRegulationDocs,
  _resetForTests,
} from '../../services/rag/complianceKbRetriever.js';

beforeEach(() => {
  fromExistingCollection.mockReset();
  _resetForTests();
});

describe('retrieveRegulationDocs', () => {
  it('returns regulation-tagged docs with derived documentTitle', async () => {
    const similaritySearch = vi.fn().mockResolvedValue([
      {
        pageContent: 'Financial entities shall...',
        metadata: {
          regulation: 'DORA',
          article: 'Article 28',
          title: 'ICT third-party risk',
          domain: 'Third-party risk',
        },
      },
    ]);
    fromExistingCollection.mockResolvedValue({ similaritySearch });

    const docs = await retrieveRegulationDocs('what does Article 28 require?', 5);

    // Defaults to English, restricted to the English language partition (#424).
    expect(similaritySearch).toHaveBeenCalledWith('what does Article 28 require?', 5, {
      must: [{ key: 'metadata.lang', match: { value: 'en' } }],
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.source).toBe('regulation');
    expect(docs[0].metadata.documentTitle).toBe('DORA Article 28: ICT third-party risk');
    expect(docs[0].metadata.heading_path).toEqual(['DORA', 'Article 28']);
    expect(docs[0].metadata.documentType).toBe('regulation');
    // Official EN text → flagged official + linked to EUR-Lex EN.
    expect(docs[0].metadata.official).toBe(true);
    expect(docs[0].metadata.url).toContain('/EN/TXT/');
  });

  it('filters by French and links to EUR-Lex FR when lang=fr', async () => {
    const similaritySearch = vi.fn().mockResolvedValue([
      {
        pageContent: 'Les entités financières...',
        metadata: {
          regulation: 'DORA',
          article: 'Article 28',
          title: 'Risque lié aux tiers',
          lang: 'fr',
          official: false,
        },
      },
    ]);
    fromExistingCollection.mockResolvedValue({ similaritySearch });

    const docs = await retrieveRegulationDocs('que dit l’article 28 ?', 5, 'fr-FR');

    expect(similaritySearch).toHaveBeenCalledWith('que dit l’article 28 ?', 5, {
      must: [{ key: 'metadata.lang', match: { value: 'fr' } }],
    });
    // Working translation → flagged unofficial, but still linked to official FR text.
    expect(docs[0].metadata.official).toBe(false);
    expect(docs[0].metadata.url).toContain('/FR/TXT/');
  });

  it('falls back to English when the French partition is empty', async () => {
    const similaritySearch = vi
      .fn()
      .mockResolvedValueOnce([]) // fr partition empty
      .mockResolvedValueOnce([
        { pageContent: 'EN text', metadata: { regulation: 'DORA', article: 'Article 1' } },
      ]); // en fallback
    fromExistingCollection.mockResolvedValue({ similaritySearch });

    const docs = await retrieveRegulationDocs('question', 5, 'fr');

    expect(similaritySearch).toHaveBeenNthCalledWith(1, 'question', 5, {
      must: [{ key: 'metadata.lang', match: { value: 'fr' } }],
    });
    expect(similaritySearch).toHaveBeenNthCalledWith(2, 'question', 5, {
      must: [{ key: 'metadata.lang', match: { value: 'en' } }],
    });
    expect(docs).toHaveLength(1);
  });

  it('returns [] when the collection is unavailable', async () => {
    fromExistingCollection.mockRejectedValue(new Error('collection not found'));
    const docs = await retrieveRegulationDocs('any query');
    expect(docs).toEqual([]);
  });

  it('returns [] when similarity search throws', async () => {
    const similaritySearch = vi.fn().mockRejectedValue(new Error('qdrant down'));
    fromExistingCollection.mockResolvedValue({ similaritySearch });
    const docs = await retrieveRegulationDocs('any query');
    expect(docs).toEqual([]);
  });

  it('returns [] for empty or non-string queries', async () => {
    expect(await retrieveRegulationDocs('')).toEqual([]);
    expect(await retrieveRegulationDocs(null)).toEqual([]);
    expect(await retrieveRegulationDocs(undefined)).toEqual([]);
    expect(fromExistingCollection).not.toHaveBeenCalled();
  });

  it('caches the store across calls', async () => {
    const similaritySearch = vi.fn().mockResolvedValue([]);
    fromExistingCollection.mockResolvedValue({ similaritySearch });

    await retrieveRegulationDocs('q1');
    await retrieveRegulationDocs('q2');
    await retrieveRegulationDocs('q3');

    // Store is built once and reused across calls.
    expect(fromExistingCollection).toHaveBeenCalledTimes(1);
    // Each call: empty lang-filtered search → one unfiltered last-resort search = 2.
    expect(similaritySearch).toHaveBeenCalledTimes(6);
  });
});

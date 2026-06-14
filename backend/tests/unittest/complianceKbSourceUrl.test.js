import { describe, it, expect, vi } from 'vitest';

// Avoid pulling the real LangChain Qdrant store at import time.
vi.mock('@langchain/qdrant', () => ({
  QdrantVectorStore: { fromExistingCollection: vi.fn() },
}));

const { eurLexUrl } = await import('../../services/rag/complianceKbRetriever.js');

/**
 * #424 — regulation citations link to the OFFICIAL EUR-Lex text, in the user's
 * language (the regulation is published verbatim in all EU languages).
 */
describe('compliance KB source URLs (#424)', () => {
  it('links DORA to the English EUR-Lex text by default', () => {
    expect(eurLexUrl('DORA', 'en')).toBe(
      'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554'
    );
  });

  it('links DORA to the French EUR-Lex text for fr / fr-FR', () => {
    expect(eurLexUrl('DORA', 'fr')).toContain('/FR/TXT/');
    expect(eurLexUrl('DORA', 'fr-FR')).toContain('/FR/TXT/');
  });

  it('defaults to EN for an unknown or missing locale', () => {
    expect(eurLexUrl('DORA', undefined)).toContain('/EN/TXT/');
    expect(eurLexUrl('DORA', 'de')).toContain('/EN/TXT/');
  });

  it('returns no URL where we have no reliable CELEX (DORA-RTS, unknown)', () => {
    expect(eurLexUrl('DORA-RTS', 'fr')).toBeUndefined();
    expect(eurLexUrl('Unknown', 'en')).toBeUndefined();
  });
});

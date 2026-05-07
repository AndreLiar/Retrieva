import { describe, it, expect } from 'vitest';
import {
  extractCitedSourcesFromText,
  buildSkippedJudgeValidation,
} from '../../services/rag/llmJudge.js';

const sources = [
  { id: 's1', title: 'DORA Article 28', sourceNumber: 1 },
  { id: 's2', title: 'DORA Article 29', sourceNumber: 2 },
  { id: 's3', title: 'DORA Article 30', sourceNumber: 3 },
];

describe('extractCitedSourcesFromText (fast-path local extractor for #244)', () => {
  it('returns empty when no sources or no answer', () => {
    expect(extractCitedSourcesFromText('', sources)).toEqual([]);
    expect(extractCitedSourcesFromText('hello [Source 1]', [])).toEqual([]);
  });

  it('extracts a single citation', () => {
    const out = extractCitedSourcesFromText('Article 28 says X [Source 1].', sources);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('s1');
  });

  it('deduplicates repeated citations and preserves source order', () => {
    const text = 'A [Source 2]. B [Source 1]. C [Source 2]. D [Source 3].';
    const out = extractCitedSourcesFromText(text, sources);
    expect(out.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('ignores out-of-range citations', () => {
    const text = 'Maybe [Source 99] or [Source 1].';
    const out = extractCitedSourcesFromText(text, sources);
    expect(out.map((s) => s.id)).toEqual(['s1']);
  });

  it('tolerates extra whitespace inside the bracket', () => {
    const text = 'Note [Source  2] here.';
    const out = extractCitedSourcesFromText(text, sources);
    expect(out.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('buildSkippedJudgeValidation', () => {
  it('marks the validation as un-judged so telemetry can split fast-path traces', () => {
    const v = buildSkippedJudgeValidation(2);
    expect(v.judged).toBe(false);
    expect(v.citationCount).toBe(2);
    expect(v.hasHallucinations).toBe(false);
    expect(v.isGrounded).toBe(true);
    expect(v.confidence).toBe(1);
  });
});

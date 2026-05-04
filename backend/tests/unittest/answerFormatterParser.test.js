import { describe, it, expect } from 'vitest';
import { parseJsonArrayLoose } from '../../services/answerFormatter.js';

describe('parseJsonArrayLoose', () => {
  it('parses a clean JSON array', () => {
    const out = parseJsonArrayLoose('["a","b","c"]');
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('strips a ```json fenced code block', () => {
    const out = parseJsonArrayLoose('```json\n["x","y"]\n```');
    expect(out).toEqual(['x', 'y']);
  });

  it('extracts the array even when the model wraps it in prose', () => {
    const raw = "Here's a breakdown:\n[\"alpha\", \"beta\"]\nLet me know if you need more.";
    expect(parseJsonArrayLoose(raw)).toEqual(['alpha', 'beta']);
  });

  it('extracts the array when the prose precedes it', () => {
    const raw = 'I\'m sorry, but as requested: ["one","two","three"]';
    expect(parseJsonArrayLoose(raw)).toEqual(['one', 'two', 'three']);
  });

  it('returns null when no array brackets are present', () => {
    expect(parseJsonArrayLoose('just prose with no array')).toBeNull();
  });

  it('returns null on non-string input', () => {
    expect(parseJsonArrayLoose(null)).toBeNull();
    expect(parseJsonArrayLoose(42)).toBeNull();
  });

  it('returns null when bracketed content is not valid JSON', () => {
    expect(parseJsonArrayLoose('[not, valid, json]')).toBeNull();
  });

  it('returns null when the JSON parses to a non-array', () => {
    expect(parseJsonArrayLoose('{"a":1}')).toBeNull();
  });
});

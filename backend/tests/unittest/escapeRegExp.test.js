import { describe, it, expect } from 'vitest';
import { escapeRegExp } from '../../utils/core/escapeRegExp.js';

describe('escapeRegExp (D2)', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c+')).toBe('a\\.b\\*c\\+');
    expect(escapeRegExp('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
    expect(escapeRegExp('[abc]')).toBe('\\[abc\\]');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeRegExp('hello world 123')).toBe('hello world 123');
  });

  it('handles null/undefined safely', () => {
    expect(escapeRegExp(null)).toBe('');
    expect(escapeRegExp(undefined)).toBe('');
  });

  it('neutralizes a ReDoS payload so it matches literally', () => {
    const escaped = escapeRegExp('(a+)+$');
    // Building a RegExp from the escaped string must not throw and treats it literally.
    const re = new RegExp(escaped);
    expect(re.test('(a+)+$')).toBe(true);
    expect(re.test('aaaa')).toBe(false);
  });
});

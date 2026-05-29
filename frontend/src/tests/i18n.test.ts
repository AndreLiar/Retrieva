import { describe, it, expect } from 'vitest';

import en from '@/shared/i18n/locales/en.json';
import fr from '@/shared/i18n/locales/fr.json';

type Dict = { [key: string]: string | Dict };

function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

describe('i18n dictionaries (en / fr)', () => {
  const enFlat = flatten(en as Dict);
  const frFlat = flatten(fr as Dict);

  it('fr defines a translation for every en key (and no extras)', () => {
    expect(Object.keys(frFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('no fr translation is empty', () => {
    const empty = Object.entries(frFlat)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';

function collectKeyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locale parity', () => {
  it('en.json and es.json declare exactly the same set of translation keys', () => {
    const enKeys = collectKeyPaths(en).sort();
    const esKeys = collectKeyPaths(es).sort();

    const missingFromEs = enKeys.filter((k) => !esKeys.includes(k));
    const missingFromEn = esKeys.filter((k) => !enKeys.includes(k));

    expect(missingFromEs).toEqual([]);
    expect(missingFromEn).toEqual([]);
  });
});

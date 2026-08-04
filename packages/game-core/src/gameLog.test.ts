import { describe, expect, it } from 'vitest';
import { extractGameLogEntries } from './gameLog.js';

describe('extractGameLogEntries', () => {
  it('returns an empty array for a missing or non-array log', () => {
    expect(extractGameLogEntries(undefined)).toEqual([]);
    expect(extractGameLogEntries(null)).toEqual([]);
    expect(extractGameLogEntries('nope')).toEqual([]);
    expect(extractGameLogEntries({ key: 'not.an.array' })).toEqual([]);
  });

  it('passes well-formed entries through unchanged', () => {
    const log = [
      { key: 'theMind.log.cardPlayed', params: { actor: '0', card: 42 } },
      { key: 'theMind.log.matchWon' },
    ];
    expect(extractGameLogEntries(log)).toEqual(log);
  });

  it('preserves the sound field when present', () => {
    const log = [{ key: 'regicide.log.enemyDefeated', sound: 'success' }];
    expect(extractGameLogEntries(log)).toEqual(log);
  });

  it('filters out malformed entries but keeps the valid ones around them', () => {
    const good = { key: 'a.b' };
    const alsoGood = { key: 'c.d' };
    expect(
      extractGameLogEntries([good, null, 'string', 42, { noKey: true }, { key: 7 }, alsoGood]),
    ).toEqual([good, alsoGood]);
  });
});

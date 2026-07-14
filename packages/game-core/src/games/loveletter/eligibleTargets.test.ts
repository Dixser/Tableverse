import { describe, expect, it } from 'vitest';
import { eligibleTargets } from './eligibleTargets.js';

const view = (overrides: {
  eliminated?: Record<string, boolean>;
  handmaidProtected?: Record<string, boolean>;
  playedCards?: Record<string, unknown>;
}) => ({
  eliminated: { '0': false, '1': false, '2': false },
  handmaidProtected: { '0': false, '1': false, '2': false },
  playedCards: { '0': [], '1': [], '2': [] },
  ...overrides,
});

describe('eligibleTargets', () => {
  it('Guard/Priest/Baron/King (AC2): excludes self and protected opponents', () => {
    const result = eligibleTargets(
      1,
      '0',
      view({ handmaidProtected: { '0': false, '1': true, '2': false } }),
    );
    expect(result.sort()).toEqual(['2']);
  });

  it('Guard/Priest/Baron/King: excludes eliminated players', () => {
    const result = eligibleTargets(2, '0', view({ eliminated: { '0': false, '1': true, '2': false } }));
    expect(result).toEqual(['2']);
  });

  it('Guard/Priest/Baron/King: never includes self even if unprotected (AC6)', () => {
    const result = eligibleTargets(3, '0', view({}));
    expect(result).not.toContain('0');
  });

  it('Prince (AC6): includes self even when self-protected', () => {
    const result = eligibleTargets(
      5,
      '0',
      view({ handmaidProtected: { '0': true, '1': true, '2': true } }),
    );
    expect(result).toEqual(['0']);
  });

  it('Prince: excludes protected opponents but keeps unprotected ones and self', () => {
    const result = eligibleTargets(
      5,
      '0',
      view({ handmaidProtected: { '0': false, '1': true, '2': false } }),
    );
    expect(result.sort()).toEqual(['0', '2']);
  });

  it('everyone protected except self yields no targets for Guard (AC6 fallback)', () => {
    const result = eligibleTargets(
      1,
      '0',
      view({ handmaidProtected: { '0': false, '1': true, '2': true } }),
    );
    expect(result).toEqual([]);
  });
});

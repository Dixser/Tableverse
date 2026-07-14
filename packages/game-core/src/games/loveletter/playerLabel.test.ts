import { describe, expect, it } from 'vitest';
import i18n from './i18nFixture.js';
import { playerLabel } from './playerLabel.js';

const t = i18n.getFixedT('en');

describe('playerLabel', () => {
  it('falls back to the seat label when no name has synced', () => {
    expect(playerLabel('0', undefined, t)).toBe('Seat 1');
    expect(playerLabel('0', {}, t)).toBe('Seat 1');
  });

  it('shows the username when exactly one seat claims it', () => {
    expect(playerLabel('0', { '0': 'Alice', '1': 'Bob' }, t)).toBe('Alice');
  });

  it('disambiguates with the seat label when the same name claims multiple seats', () => {
    const names = { '0': 'Alice', '1': 'Alice', '2': 'Bob' };
    expect(playerLabel('0', names, t)).toBe('Alice (Seat 1)');
    expect(playerLabel('1', names, t)).toBe('Alice (Seat 2)');
    expect(playerLabel('2', names, t)).toBe('Bob');
  });
});

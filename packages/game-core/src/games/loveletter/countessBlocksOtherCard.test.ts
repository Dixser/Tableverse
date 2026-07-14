import { describe, expect, it } from 'vitest';
import { countessBlocksOtherCard } from './countessBlocksOtherCard.js';

describe('countessBlocksOtherCard', () => {
  it('true when the Countess is held alongside the King (AC5)', () => {
    expect(countessBlocksOtherCard([8, 7])).toBe(true);
  });

  it('true when the Countess is held alongside the Prince (AC5)', () => {
    expect(countessBlocksOtherCard([5, 8])).toBe(true);
  });

  it('false when the Countess is held alongside neither (AC5)', () => {
    expect(countessBlocksOtherCard([8, 2])).toBe(false);
  });

  it('false when the Countess is not held at all', () => {
    expect(countessBlocksOtherCard([5, 7])).toBe(false);
  });

  it('false for a single-card hand containing only the Countess', () => {
    expect(countessBlocksOtherCard([8])).toBe(false);
  });
});

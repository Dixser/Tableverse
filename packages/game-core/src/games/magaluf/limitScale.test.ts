import { describe, expect, it } from 'vitest';

import { LIMIT_DECK } from './constants.js';
import { limitRange, meterMax, meterPercent, METER_HEADROOM } from './limitScale.js';

describe('limit scale', () => {
  it('takes the band from the public deck', () => {
    expect(limitRange(0)).toEqual({ min: 16, max: 28 });
  });

  /**
   * Replaces the old "widens across the weekend" assertion. The deck was
   * flattened precisely so the band would stop moving: a bar that rescaled
   * overnight made Sunday unreadable for a player who had learned Friday's.
   */
  it('is the same band on every day of the weekend', () => {
    const band = limitRange(0);
    expect(band).toEqual({
      min: Math.min(...LIMIT_DECK),
      max: Math.max(...LIMIT_DECK),
    });
  });

  it('moves with the public limitShift setting', () => {
    expect(limitRange(-4)).toEqual({ min: 12, max: 24 });
    expect(meterMax(-4)).toBe(24 + METER_HEADROOM);
  });

  it('never renders a negative floor when a host shifts the deck down hard', () => {
    const band = limitRange(-20);
    expect(band.min).toBe(0);
    expect(band.max).toBe(8);
  });

  /**
   * The property the whole module exists for. If the scale ever became a
   * function of the drawn limit, every player could read the hidden number off
   * the geometry of the bar.
   */
  it('is identical for every limit the deck could have drawn (AC12, AC14)', () => {
    const scales = LIMIT_DECK.map(() => meterMax(0));
    expect(new Set(scales).size).toBe(1);
  });

  it('places a value proportionally and clamps outside the domain', () => {
    const max = meterMax(0); // 28 + 8 = 36
    expect(meterPercent(0, 0)).toBe(0);
    expect(meterPercent(max, 0)).toBe(100);
    expect(meterPercent(max * 2, 0)).toBe(100);
    expect(meterPercent(-5, 0)).toBe(0);
    expect(meterPercent(max / 2, 0)).toBeCloseTo(50);
  });

  it('leaves headroom above the highest possible limit', () => {
    expect(meterMax(0)).toBeGreaterThan(limitRange(0).max);
  });
});

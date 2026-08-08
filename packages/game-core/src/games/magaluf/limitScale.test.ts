import { describe, expect, it } from 'vitest';

import { LIMIT_DECKS } from './constants.js';
import { limitRange, meterMax, meterPercent, METER_HEADROOM } from './limitScale.js';

describe('limit scale', () => {
  it('takes the band from the day’s public deck', () => {
    expect(limitRange(0, 0)).toEqual({ min: 26, max: 29 });
    expect(limitRange(2, 0)).toEqual({ min: 14, max: 26 });
  });

  it('widens across the weekend, which is the point of the band (AC13)', () => {
    const friday = limitRange(0, 0);
    const sunday = limitRange(2, 0);
    expect(sunday.max - sunday.min).toBeGreaterThan(friday.max - friday.min);
  });

  it('moves with the public limitShift setting', () => {
    expect(limitRange(0, -4)).toEqual({ min: 22, max: 25 });
    expect(meterMax(0, -4)).toBe(25 + METER_HEADROOM);
  });

  it('never renders a negative floor when a host shifts the decks down hard', () => {
    const band = limitRange(2, -20);
    expect(band.min).toBe(0);
    expect(band.max).toBe(6);
  });

  /**
   * The property the whole module exists for. If the scale ever became a
   * function of the drawn limit, every player could read the hidden number off
   * the geometry of the bar.
   */
  it('is identical for every limit the day could have drawn (AC12, AC14)', () => {
    for (let day = 0; day < 3; day++) {
      const deck = LIMIT_DECKS[['viernes', 'sabado', 'domingo'][day]!]!;
      const scales = deck.map(() => meterMax(day, 0));
      expect(new Set(scales).size).toBe(1);
    }
  });

  it('places a value proportionally and clamps outside the domain', () => {
    const max = meterMax(0, 0); // 29 + 8 = 37
    expect(meterPercent(0, 0, 0)).toBe(0);
    expect(meterPercent(max, 0, 0)).toBe(100);
    expect(meterPercent(max * 2, 0, 0)).toBe(100);
    expect(meterPercent(-5, 0, 0)).toBe(0);
    expect(meterPercent(max / 2, 0, 0)).toBeCloseTo(50);
  });

  it('leaves headroom above the highest possible limit', () => {
    for (let day = 0; day < 3; day++) {
      expect(meterMax(day, 0)).toBeGreaterThan(limitRange(day, 0).max);
    }
  });
});

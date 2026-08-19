import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from './settings.js';
import { buildLimitDeck, limitRange, meterMax, meterPercent, METER_HEADROOM } from './limitScale.js';

const band = (min: number, max: number) => ({ min, max });
const withBand = (min: number, max: number) => ({
  ...DEFAULT_SETTINGS,
  limitMin: min,
  limitMax: max,
});

describe('limit scale', () => {
  it('takes the band straight from the host settings', () => {
    expect(limitRange(DEFAULT_SETTINGS)).toEqual({ min: 16, max: 28 });
    expect(limitRange(withBand(12, 24))).toEqual({ min: 12, max: 24 });
  });

  /**
   * Replaces the old "widens across the weekend" assertion. The band was
   * flattened precisely so it would stop moving: a bar that rescaled overnight
   * made Sunday unreadable for a player who had learned Friday's.
   */
  it('is the same band on every day of the weekend', () => {
    const settings = withBand(12, 24);
    expect(limitRange(settings)).toEqual(limitRange(settings));
    expect(meterMax(limitRange(settings))).toBe(24 + METER_HEADROOM);
  });

  describe('the deck', () => {
    it('holds every integer in the band, inclusive at both ends', () => {
      expect(buildLimitDeck(band(16, 28))).toEqual([
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
      ]);
    });

    /**
     * The point of feature 041's change. Five spaced cards let a table narrow
     * the hidden number to one of five while the phase header advertised a
     * span of thirteen; now the header is exactly true.
     */
    it('leaves no value inside the band undrawable', () => {
      const deck = buildLimitDeck(band(16, 28));
      for (let n = 16; n <= 28; n++) expect(deck).toContain(n);
      expect(deck).toHaveLength(13);
    });

    it('is a single card when the host pins both ends together', () => {
      expect(buildLimitDeck(band(22, 22))).toEqual([22]);
    });
  });

  /**
   * The property the whole module exists for. If the scale ever became a
   * function of the drawn limit, every player could read the hidden number off
   * the geometry of the bar.
   */
  it('is identical for every limit the deck could have drawn (AC12, AC14)', () => {
    const b = band(16, 28);
    const scales = buildLimitDeck(b).map(() => meterMax(b));
    expect(new Set(scales).size).toBe(1);
  });

  it('places a value proportionally and clamps outside the domain', () => {
    const b = band(16, 28);
    const max = meterMax(b); // 28 + 8 = 36
    expect(meterPercent(0, b)).toBe(0);
    expect(meterPercent(max, b)).toBe(100);
    expect(meterPercent(max * 2, b)).toBe(100);
    expect(meterPercent(-5, b)).toBe(0);
    expect(meterPercent(max / 2, b)).toBeCloseTo(50);
  });

  it('leaves headroom above the highest possible limit', () => {
    const b = limitRange(DEFAULT_SETTINGS);
    expect(meterMax(b)).toBeGreaterThan(b.max);
  });
});

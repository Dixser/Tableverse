export type LoveLetterEdition = 'normal' | 'classic';
export type CardRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const NORMAL_COMPOSITION: Record<CardRank, number> = {
  0: 2,
  1: 6,
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 1,
  8: 1,
  9: 1,
};

// Classic (the original 1995/2012 edition) removes 1 Guard and both
// Chancellors and Spies relative to Normal (the 2019 superset edition) --
// see spec.md's "Deck composition" table.
export const CLASSIC_REMOVALS: Partial<Record<CardRank, number>> = {
  0: 2,
  1: 1,
  6: 2,
};

export function buildDeck(edition: LoveLetterEdition): CardRank[] {
  const composition = { ...NORMAL_COMPOSITION };
  if (edition === 'classic') {
    for (const [rank, removeCount] of Object.entries(CLASSIC_REMOVALS)) {
      composition[Number(rank) as CardRank] -= removeCount;
    }
  }
  return Object.entries(composition).flatMap(([rank, count]) =>
    Array(count).fill(Number(rank) as CardRank),
  );
}

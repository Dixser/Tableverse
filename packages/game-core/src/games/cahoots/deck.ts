export type Color = 'blue' | 'yellow' | 'red' | 'green';

export const COLORS: Color[] = ['blue', 'yellow', 'red', 'green'];

/** A number card: one of 4 colors, numbered 1-7, two copies of each per color. */
export interface Card {
  id: string;
  color: Color;
  number: number;
}

function cardId(color: Color, number: number, copy: number): string {
  return `${color}${number}-${copy}`;
}

/** Unshuffled 56-card deck: 4 colors x numbers 1-7, two copies of each. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    for (let number = 1; number <= 7; number++) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: cardId(color, number, copy), color, number });
      }
    }
  }
  return cards;
}

/**
 * A card may be placed on a pile whose current top card shares its color,
 * its number, or both -- the rulebook's own single placement rule. Shared
 * by gameDef.ts's playCard move and the client's drag-highlight logic, so
 * legality is never independently reimplemented in the UI.
 */
export function isLegalPlacement(card: Card, pileTop: Card): boolean {
  return card.color === pileTop.color || card.number === pileTop.number;
}

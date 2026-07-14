import type { CardRank } from './deck.js';

/**
 * Which seated players a targeted card may legally be played on, from the
 * acting player's own point of view -- see spec/features/015-loveletter-board/plan.md.
 * Prince (rank 5) always includes the acting player themselves, even when
 * self-protected by their own Handmaid; every other targeted card
 * (Guard/Priest/Baron/King) excludes both the acting player and any
 * Handmaid-protected opponent.
 */
export function eligibleTargets(
  cardRank: CardRank,
  selfID: string,
  view: {
    eliminated: Record<string, boolean>;
    handmaidProtected: Record<string, boolean>;
    playedCards: Record<string, unknown>;
  },
): string[] {
  const seats = Object.keys(view.playedCards);
  const alive = seats.filter((id) => !view.eliminated[id]);
  if (cardRank === 5) {
    return alive.filter((id) => id === selfID || !view.handmaidProtected[id]);
  }
  return alive.filter((id) => id !== selfID && !view.handmaidProtected[id]);
}

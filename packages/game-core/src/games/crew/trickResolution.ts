import type { Card, Suit } from './deck.js';

export interface TrickPlay {
  seatID: string;
  card: Card;
}

/**
 * Whether `card` is a legal play given the caller's own hand and the suit
 * led this trick (null if this play would be the lead). A player must
 * follow the led suit -- color or rocket -- if they hold any card of it;
 * only when they hold none may they play anything else, including a
 * rocket to "cut" a color-suited trick. Pure and hand-scoped so both the
 * server move validator and the client's card-disabling UI can call the
 * exact same function, same reuse pattern as regicide/legalPlay.ts.
 */
export function isLegalTrickPlay(hand: Card[], ledSuit: Suit | null, card: Card): boolean {
  if (ledSuit === null) return true;
  const hasLedSuit = hand.some((c) => c.suit === ledSuit);
  if (!hasLedSuit) return true;
  return card.suit === ledSuit;
}

/**
 * Resolves a completed trick's winner. Rockets are trump: if any rocket
 * was played, the highest rocket wins outright regardless of the led
 * suit (this also correctly covers a rocket-led trick, since the leading
 * rocket is itself among "any rocket played"). Otherwise the highest
 * card matching the led suit (the first play's suit) wins -- a card of a
 * different, non-rocket suit can never win, even if its rank is higher.
 */
export function resolveTrick(plays: TrickPlay[]): { winnerSeatID: string; winningCard: Card } {
  if (plays.length === 0) throw new Error('resolveTrick: no plays');
  const rocketPlays = plays.filter((p) => p.card.suit === 'rocket');
  const contenders = rocketPlays.length > 0 ? rocketPlays : plays.filter((p) => p.card.suit === plays[0]!.card.suit);
  const winner = contenders.reduce((best, p) => (p.card.rank > best.card.rank ? p : best), contenders[0]!);
  return { winnerSeatID: winner.seatID, winningCard: winner.card };
}

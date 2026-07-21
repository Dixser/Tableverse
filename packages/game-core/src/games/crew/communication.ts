import type { Card } from './deck.js';

/**
 * The rulebook's three truthful claims a radio communication token can
 * make about a color card (never a rocket -- checked separately by the
 * caller): it's the highest of its suit in hand, the only one of its
 * suit in hand, or the lowest of its suit in hand. Exactly one of these
 * must genuinely hold or the card cannot be communicated at all.
 * Server-authoritative: these are checked against the real hand rather
 * than trusted from the client, consistent with this codebase's
 * server-authoritative philosophy (tech-stack.md).
 */
export function isHighestOfSuit(hand: Card[], card: Card): boolean {
  return hand.filter((c) => c.suit === card.suit).every((c) => c.rank <= card.rank);
}

export function isOnlyOfSuit(hand: Card[], card: Card): boolean {
  return hand.filter((c) => c.suit === card.suit).length === 1;
}

export function isLowestOfSuit(hand: Card[], card: Card): boolean {
  return hand.filter((c) => c.suit === card.suit).every((c) => c.rank >= card.rank);
}

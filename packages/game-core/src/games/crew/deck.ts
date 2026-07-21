export type ColorSuit = 'pink' | 'blue' | 'green' | 'yellow';
export type Suit = ColorSuit | 'rocket';

export const COLOR_SUITS: ColorSuit[] = ['pink', 'blue', 'green', 'yellow'];
export const ALL_SUITS: Suit[] = [...COLOR_SUITS, 'rocket'];

/** A "large" playing card -- rank 1-9 for a color suit, 1-4 for rocket. */
export interface Card {
  id: string;
  suit: Suit;
  rank: number;
}

/** A "small" task card -- always a color suit, never rocket (rockets can never be task targets, same as they can never be communicated). */
export interface TaskCard {
  id: string;
  suit: ColorSuit;
  rank: number;
}

function cardId(suit: Suit, rank: number): string {
  return `${suit}${rank}`;
}

/** The corresponding playing card's id for a task card -- a task is fulfilled by winning THIS card. */
export function taskTargetCardId(task: TaskCard): string {
  return cardId(task.suit, task.rank);
}

/** Reconstructs a Card from its id (`${suit}${rank}`) -- used by the board to render a task's target card without needing the actual Card object threaded through. */
export function parseCardId(id: string): Card {
  const match = /^([a-z]+)(\d+)$/.exec(id);
  if (!match) throw new Error(`crew-v1: invalid card id "${id}"`);
  return { id, suit: match[1] as Suit, rank: Number(match[2]) };
}

/** Unshuffled 40-card playing deck: 4 color suits ranked 1-9, plus 4 rockets ranked 1-4. */
export function buildPlayingDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of COLOR_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      cards.push({ id: cardId(suit, rank), suit, rank });
    }
  }
  for (let rank = 1; rank <= 4; rank++) {
    cards.push({ id: cardId('rocket', rank), suit: 'rocket', rank });
  }
  return cards;
}

/** Unshuffled 36-card task deck: 4 color suits ranked 1-9, no rockets. */
export function buildTaskDeck(): TaskCard[] {
  const cards: TaskCard[] = [];
  for (const suit of COLOR_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      cards.push({ id: `T${cardId(suit, rank)}`, suit, rank });
    }
  }
  return cards;
}

/** The commander is whoever holds this card after dealing -- rulebook: "whoever has the four rocket". */
export const COMMANDER_CARD_ID = cardId('rocket', 4);

/**
 * Deals an already-shuffled deck round-robin, one card at a time, to
 * `activeSeatIDs` in order, until the deck is exhausted -- draws from the
 * END of `deck` (pop()-is-draw, same convention as regicide/gameDef.ts).
 *
 * At 4 or 5 active seats, 40 divides evenly (10 or 8 each). At 3, it does
 * not (40 = 13*3 + 1): the rulebook's own handling ("one person will get
 * one more card than the rest... after the last trick, the card that is
 * left remains unplayed") is modeled here by simply continuing the
 * round-robin deal one card past even -- the seat(s) that land the extra
 * card(s) just carry one inert card in hand for the whole mission, never
 * played, because `totalTricks` (see gameDef.ts) is the MINIMUM hand size
 * across active seats, not the maximum. No separate "leftover pile" is
 * needed: the extra card is a completely ordinary card sitting in a real
 * hand, it simply never comes up because the mission's fixed number of
 * tricks runs out first. This also means a task whose target card is
 * exactly that permanently-unplayed card can never be fulfilled -- an
 * accepted, rulebook-faithful "bad deal" outcome (see gameDef.ts's
 * resolveCompletedTrick for how that's turned into a loss rather than an
 * infinite wait).
 */
export function dealHands(deck: Card[], activeSeatIDs: string[]): Record<string, Card[]> {
  const hands: Record<string, Card[]> = Object.fromEntries(activeSeatIDs.map((id) => [id, []]));
  const remaining = [...deck];
  let i = 0;
  while (remaining.length > 0) {
    const seat = activeSeatIDs[i % activeSeatIDs.length]!;
    hands[seat]!.push(remaining.pop()!);
    i++;
  }
  return hands;
}

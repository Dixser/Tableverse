export type Suit = 'S' | 'H' | 'D' | 'C';
export type NumberRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type FaceRank = 'J' | 'Q' | 'K';

export interface NumberCard {
  id: string;
  kind: 'number';
  suit: Suit;
  rank: NumberRank;
}
export interface CompanionCard {
  id: string;
  kind: 'companion';
  suit: Suit;
}
export interface JesterCard {
  id: string;
  kind: 'jester';
}
export interface FaceCard {
  id: string;
  kind: 'face';
  suit: Suit;
  rank: FaceRank;
}
export type Card = NumberCard | CompanionCard | JesterCard | FaceCard;

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const NUMBER_RANKS: NumberRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Jesters shuffled into the Tavern deck, by seated player count -- rulebook's own table. */
export const JESTER_COUNT: Record<number, number> = { 2: 0, 3: 1, 4: 2 };
/** Starting/max hand size, by seated player count -- rulebook's own table. */
export const MAX_HAND_SIZE: Record<number, number> = { 2: 7, 3: 6, 4: 5 };

const FACE_VALUE: Record<FaceRank, number> = { J: 10, Q: 15, K: 20 };

/**
 * Attack value AND discard value -- the rulebook never distinguishes the
 * two (a card is worth the same whether you're attacking with it or
 * discarding it to satisfy an enemy's attack), so one function serves both.
 */
export function cardValue(card: Card): number {
  switch (card.kind) {
    case 'number':
      return card.rank;
    case 'companion':
      return 1;
    case 'jester':
      return 0;
    case 'face':
      return FACE_VALUE[card.rank];
  }
}

export function enemyAttack(card: FaceCard): number {
  return FACE_VALUE[card.rank];
}

/** Health is always double the card's own attack value (rulebook's stat table: J 10/20, Q 15/30, K 20/40). */
export function enemyHealth(card: FaceCard): number {
  return FACE_VALUE[card.rank] * 2;
}

/** Unshuffled: 36 number cards + 4 Animal Companions (one per suit). Jesters added separately. */
function buildTavernBase(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of NUMBER_RANKS) {
      cards.push({ id: `${suit}${rank}`, kind: 'number', suit, rank });
    }
    cards.push({ id: `${suit}AC`, kind: 'companion', suit });
  }
  return cards;
}

/** Unshuffled Tavern deck for the given seated player count (2-4). */
export function buildTavernDeck(seatedPlayerCount: number): Card[] {
  const jesterCount = JESTER_COUNT[seatedPlayerCount] ?? 0;
  const jesters: JesterCard[] = Array.from({ length: jesterCount }, (_, i) => ({
    id: `Jester${i + 1}`,
    kind: 'jester',
  }));
  return [...buildTavernBase(), ...jesters];
}

function buildFaceRank(rank: FaceRank): FaceCard[] {
  return SUITS.map((suit) => ({ id: `${suit}${rank}`, kind: 'face', suit, rank }));
}

/** Unshuffled, one array per rank -- caller shuffles each independently before assembling the Castle deck. */
export function buildCastleRanks(): { jacks: FaceCard[]; queens: FaceCard[]; kings: FaceCard[] } {
  return { jacks: buildFaceRank('J'), queens: buildFaceRank('Q'), kings: buildFaceRank('K') };
}

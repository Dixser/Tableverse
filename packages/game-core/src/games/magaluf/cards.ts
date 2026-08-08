/**
 * Card catalogues — data only, no rules and no strings.
 *
 * Names and flavour text live in `magaluf.*` i18n keys derived from these
 * ids (`magaluf.alcohol.cana`, `magaluf.event.ligueTardeo`, …), never here:
 * the engine runs on the server and must not hold display text. See
 * `prototypes/magaluf/design.md` §7 and §11 for the full catalogues and the
 * reasoning behind the values.
 */

export type PhaseId = 'tardeo' | 'noche' | 'after';
export const PHASE_IDS: readonly PhaseId[] = ['tardeo', 'noche', 'after'];

export type DayId = 'viernes' | 'sabado' | 'domingo';
export const DAY_IDS: readonly DayId[] = ['viernes', 'sabado', 'domingo'];

// ---------------------------------------------------------------------------
// Alcohol
// ---------------------------------------------------------------------------

export interface AlcoholCard {
  id: string;
  /** Intoxication gained. Agua is the only negative value in the game. */
  intox: number;
  vp: number;
}

export const ALCOHOL: Record<string, AlcoholCard> = {
  cana: { id: 'cana', intox: 1, vp: 1 },
  tinto: { id: 'tinto', intox: 1, vp: 1 },
  clara: { id: 'clara', intox: 1, vp: 1 },
  pinta: { id: 'pinta', intox: 2, vp: 2 },
  vino: { id: 'vino', intox: 2, vp: 2 },
  vermut: { id: 'vermut', intox: 2, vp: 2 },
  sangria: { id: 'sangria', intox: 2, vp: 3 },
  mojito: { id: 'mojito', intox: 2, vp: 2 },
  cubata: { id: 'cubata', intox: 3, vp: 3 },
  chupito: { id: 'chupito', intox: 3, vp: 2 },
  gintonic: { id: 'gintonic', intox: 3, vp: 3 },
  coctel: { id: 'coctel', intox: 3, vp: 4 },
  jager: { id: 'jager', intox: 4, vp: 4 },
  cargada: { id: 'cargada', intox: 4, vp: 4 },
  // The five After-exclusive spirits carry a deliberately better VP-per-
  // intoxication rate. Without that edge the Tardeo was the most efficient
  // phase in the game and there was no reason to enter the dangerous one.
  hierbas: { id: 'hierbas', intox: 4, vp: 6 },
  tequila3: { id: 'tequila3', intox: 5, vp: 7 },
  absenta: { id: 'absenta', intox: 5, vp: 8 },
  garrafon: { id: 'garrafon', intox: 5, vp: 6 },
  pecera: { id: 'pecera', intox: 6, vp: 10 },
  agua: { id: 'agua', intox: -1, vp: 0 },
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemId = 'kebab' | 'botella' | 'redbull' | 'porro' | 'pastis' | 'farlopa';

export const ITEM_IDS: readonly ItemId[] = [
  'kebab',
  'botella',
  'redbull',
  'porro',
  'pastis',
  'farlopa',
];

/** What the Cacheo taxes and the Redada arrests you for. */
export const CONTRABAND: readonly ItemId[] = ['porro', 'pastis', 'farlopa'];

export function isContraband(item: ItemId): boolean {
  return CONTRABAND.includes(item);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventId =
  // Tardeo tier — mild, cheap, forgiving
  | 'ligueTardeo'
  | 'fiestaTardeo'
  | 'peleaTardeo'
  | 'chungoTardeo'
  | 'insolacion'
  | 'foto'
  // Noche tier — interactive, real teeth
  | 'ligueNoche'
  | 'fiestaNoche'
  | 'peleaNoche'
  | 'chungoNoche'
  | 'gorila'
  | 'garrafonEvent'
  // After tier — the big money and the real damage
  | 'ligueAfter'
  | 'fiestaAfter'
  | 'peleaAfter'
  | 'chungoAfter'
  | 'soloVoyAMirar'
  | 'terraza'
  | 'comaEtilico'
  // Present in more than one tier, at different frequencies
  | 'karaoke'
  | 'barraLibre'
  | 'reyGuiri'
  | 'perdido'
  | 'chupitoCasa'
  | 'ronda'
  | 'vomitona'
  | 'ambulancia'
  | 'kebabEvent'
  | 'aguaEvent'
  | 'redbullEvent'
  // One card per item the dealer can hand over, rather than one card that
  // rolls between three. At a real table the odds of getting a joint versus a
  // gram have to be the number of cards in the deck, not a die nobody would
  // think to roll -- and it buys a mix that can differ per venue, which a
  // single random pick could never express.
  | 'camelloPorro'
  | 'camelloPastis'
  | 'camelloFarlopa'
  | 'cacheo'
  | 'redada'
  | 'nada';

export interface EventCard {
  id: EventId;
  /** VP to the drawing player. Negative is a loss. */
  vp?: number;
  /** Intoxication to the drawing player. */
  intox?: number;
  /** VP to every player still partying, including the drawer. */
  vpAll?: number;
  /** Permanent Resaca inflicted. */
  resaca?: number;
  /** Intoxication removed before Resaca is applied. */
  relief?: number;
  /** The drawing player loses every item they hold. */
  losesItems?: boolean;
  /** The item this card hands over. Printed on the card, never rolled for. */
  givesItem?: ItemId;
}

/**
 * Most events are pure data; only the ones with structural behaviour need a
 * handler in `events.ts`.
 *
 * Effect magnitudes live on the card rather than in `constants.ts`, next to
 * the alcohol values. Keeping a card's numbers on the card is what stops the
 * effect and its translated text drifting apart.
 */
export const EVENTS: Record<EventId, EventCard> = {
  // Tardeo tier
  ligueTardeo: { id: 'ligueTardeo', vp: 2 },
  fiestaTardeo: { id: 'fiestaTardeo', vpAll: 1 },
  peleaTardeo: { id: 'peleaTardeo', vp: 2, intox: 1 },
  chungoTardeo: { id: 'chungoTardeo', vp: -2 },
  insolacion: { id: 'insolacion', intox: 2 },
  foto: { id: 'foto', vp: 2 },

  // Noche tier
  ligueNoche: { id: 'ligueNoche', vp: 4 },
  fiestaNoche: { id: 'fiestaNoche', vpAll: 2 },
  peleaNoche: { id: 'peleaNoche', vp: 4, intox: 2 },
  chungoNoche: { id: 'chungoNoche', losesItems: true },
  gorila: { id: 'gorila' },
  garrafonEvent: { id: 'garrafonEvent', intox: 3 },

  // After tier
  ligueAfter: { id: 'ligueAfter', vp: 6 },
  fiestaAfter: { id: 'fiestaAfter', vpAll: 3 },
  peleaAfter: { id: 'peleaAfter', vp: 6, intox: 3 },
  chungoAfter: { id: 'chungoAfter', vp: -4, losesItems: true },
  soloVoyAMirar: { id: 'soloVoyAMirar', vp: 6 },
  terraza: { id: 'terraza', vp: 8, intox: 3 },
  comaEtilico: { id: 'comaEtilico', intox: 5 },

  // Shared across tiers
  karaoke: { id: 'karaoke', vp: 2 },
  barraLibre: { id: 'barraLibre' },
  reyGuiri: { id: 'reyGuiri', vp: 3 },
  perdido: { id: 'perdido' },
  chupitoCasa: { id: 'chupitoCasa' },
  ronda: { id: 'ronda' },
  vomitona: { id: 'vomitona', relief: 4, resaca: 3 },
  ambulancia: { id: 'ambulancia', relief: 5, resaca: 4 },
  kebabEvent: { id: 'kebabEvent', givesItem: 'kebab' },
  aguaEvent: { id: 'aguaEvent', givesItem: 'botella' },
  redbullEvent: { id: 'redbullEvent', givesItem: 'redbull' },
  camelloPorro: { id: 'camelloPorro', givesItem: 'porro' },
  camelloPastis: { id: 'camelloPastis', givesItem: 'pastis' },
  camelloFarlopa: { id: 'camelloFarlopa', givesItem: 'farlopa' },
  cacheo: { id: 'cacheo', vp: -3 },
  redada: { id: 'redada' },
  nada: { id: 'nada' },
};

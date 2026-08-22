/**
 * Card catalogues — data only, no rules and no strings.
 *
 * Titles, effect text and flavour live in `magaluf.*` i18n keys derived from
 * these ids (`magaluf.alcohol.cana.title`, `magaluf.event.ligueTardeo.flavor.0`,
 * …), never here: the engine runs on the server and must not hold display
 * text. See `prototypes/magaluf/design.md` §7 and §11 for the full catalogues
 * and the reasoning behind the values.
 */

/**
 * One physical card, as opposed to one *kind* of card.
 *
 * The deck holds these rather than bare ids because the two Ligue de piscina
 * cards in the Tardeo are two different printed cards: same title, same
 * effect, different picture and different line underneath it. That is how the
 * genre does it, and it only works if the copy is identified before it is
 * shuffled — pick the artwork at draw time and you get the same picture twice
 * in a phase, never see the third, and watch a card come back from the discard
 * wearing someone else's face.
 *
 * `variant` is 0-based and assigned by `buildDeck` per copy, so a deck holding
 * three of something uses variants 0, 1 and 2. The i18n catalogue therefore
 * has to carry at least as many flavour lines as the largest count any one
 * phase deck asks for — `i18nKeys.test.ts` is what holds that to account.
 */
export interface CardInstance<Id extends string = string> {
  id: Id;
  variant: number;
}

/**
 * The artwork file for one printed card, named from the id rather than from
 * the title: the picture is shared by every language, and titles are not.
 * 1-based on the filename because it is read by people, 0-based in the data
 * because it indexes an array.
 */
export function cardArt(id: string, variant: number): string {
  return `${id}${String(variant + 1).padStart(2, '0')}.png`;
}

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
  | 'perdido'
  | 'chupitoCasa'
  | 'ronda'
  | 'vomitona'
  | 'ambulancia'
  | 'kebabEvent'
  | 'aguaEvent'
  | 'redbullEvent'
  // One card per item the dealer can offer, rather than one card that rolls
  // between three. At a real table the odds of being offered a joint versus a
  // gram have to be the number of cards in the deck, not a die nobody would
  // think to roll -- and it buys a mix that can differ per venue, which a
  // single random pick could never express. Each one asks before it hands
  // anything over; see the cards themselves.
  | 'camelloPorro'
  | 'camelloPastis'
  | 'camelloFarlopa'
  | 'cacheo'
  | 'redada'
  | 'nada'
  // Catch-up. Both retarget to whoever is last on points -- see EVENTS.
  | 'colecta'
  | 'remontada'
  // Cards that ask a question instead of announcing an outcome. See EventCard's
  // `options` and the table in `spec/features/034-magaluf-choices/spec.md`.
  | 'ultimaRonda'
  | 'resacon'
  | 'invitacion'
  | 'dobleONada'
  | 'saltarLaCola';

/**
 * Every id an option button can carry. Closed, like EventId, so a typo is a
 * compile error rather than a missing translation discovered at the table.
 */
export type EventOptionId =
  | 'vomitar'
  | 'aguantar'
  | 'pagarLaCuenta'
  | 'perderTodo'
  | 'subirALaTerraza'
  | 'quedarseAbajo'
  | 'unaMas'
  | 'mananaLoPago'
  | 'dormirla'
  | 'seguirDeFiesta'
  | 'cobrarla'
  | 'pillarKebab'
  | 'doblar'
  | 'pasar'
  | 'colarse'
  | 'hacerCola'
  | 'pillarPorro'
  | 'pillarPastis'
  | 'pillarFarlopa'
  | 'dejarlo';

/**
 * What a card — or one branch of a card — does.
 *
 * Split out from EventCard so both share one shape and one applier: a choice
 * card's branches are ordinary card effects, and nothing is gained by giving
 * them a second vocabulary.
 */
export interface EventEffects {
  /** VP to the drawing player. Negative is a loss. */
  vp?: number;
  /** Intoxication to the drawing player. */
  intox?: number;
  /** VP to every player still partying, including the drawer. */
  vpAll?: number;
  /** Resaca inflicted. Signed — a negative value sleeps some off. */
  resaca?: number;
  /** Intoxication removed before Resaca is applied. */
  relief?: number;
  /** The drawing player loses every item they hold. */
  losesItems?: boolean;
  /** The item this card hands over. Printed on the card, never rolled for. */
  givesItem?: ItemId;

  // --- Structural. Only ever set on an option. ---------------------------
  /** Leaves the phase. Chosen, but not a withdrawal — no Aguafiestas penalty. */
  leaves?: boolean;
  /** Draws one extra alcohol card. Never draws an event: that would chain. */
  extraDrink?: boolean;
  /** Arms the Pastis doubler, so `extraDrink` lands at double VP. */
  doubles?: boolean;
  /** Loses the next turn. */
  skips?: boolean;
}

export interface EventOption extends EventEffects {
  /** i18n: `magaluf.eventOption.<id>`. */
  id: EventOptionId;
}

export interface EventCard extends EventEffects {
  id: EventId;
  /**
   * When present, the drawing player picks exactly one branch and **nothing on
   * the card itself applies**.
   *
   * The reason these exist: every other card in the deck is pure outcome, so a
   * player who drew cheap alcohol and expensive events had no lever at all and
   * the comeback was arithmetically gone. A choice does not remove the luck —
   * you still do not pick the card — it just means the luck hands you a
   * decision rather than a result.
   */
  options?: readonly EventOption[];
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
  // Two penalties. Paying is the flat, boring, correct play when you are
  // holding nothing — which is exactly when the old version did nothing at all.
  chungoNoche: {
    id: 'chungoNoche',
    options: [
      { id: 'pagarLaCuenta', vp: -4 },
      { id: 'perderTodo', losesItems: true },
    ],
  },
  gorila: { id: 'gorila' },
  garrafonEvent: { id: 'garrafonEvent', intox: 3 },

  // After tier
  ligueAfter: { id: 'ligueAfter', vp: 6 },
  fiestaAfter: { id: 'fiestaAfter', vpAll: 3 },
  peleaAfter: { id: 'peleaAfter', vp: 6, intox: 3 },
  chungoAfter: { id: 'chungoAfter', vp: -4, losesItems: true },
  soloVoyAMirar: { id: 'soloVoyAMirar', vp: 6 },
  // Two bonuses. The safe branch is genuinely worth taking when you are one
  // drink under the limit, which is the whole point of offering it.
  terraza: {
    id: 'terraza',
    options: [
      { id: 'subirALaTerraza', vp: 8, intox: 3 },
      { id: 'quedarseAbajo', vp: 3 },
    ],
  },
  comaEtilico: { id: 'comaEtilico', intox: 5 },

  // Shared across tiers
  karaoke: { id: 'karaoke', vp: 2 },
  barraLibre: { id: 'barraLibre' },
  perdido: { id: 'perdido' },
  chupitoCasa: { id: 'chupitoCasa' },
  ronda: { id: 'ronda' },
  // The card that started this. It used to hand you −4 intoxication and +3
  // resaca whether you wanted the trade or not, which meant a lucky player
  // banked the relief and an unlucky one carried the hangover to Sunday for
  // nothing. Now you decide whether tonight's headroom is worth tomorrow's.
  vomitona: {
    id: 'vomitona',
    options: [
      { id: 'vomitar', relief: 4, resaca: 3 },
      { id: 'aguantar', intox: 2 },
    ],
  },
  // Resaca 3 rather than 4: this is the last source nobody chooses — it
  // retargets to the drunkest seat, not the drawer — so it should also be the
  // mildest now that every other source is either opt-in or self-inflicted.
  ambulancia: { id: 'ambulancia', relief: 5, resaca: 3 },
  kebabEvent: { id: 'kebabEvent', givesItem: 'kebab' },
  aguaEvent: { id: 'aguaEvent', givesItem: 'botella' },
  redbullEvent: { id: 'redbullEvent', givesItem: 'redbull' },
  // The dealer offers; he does not hand over. Contraband used to arrive
  // unasked, so a Redada two seats later arrested you for a joint you never
  // agreed to carry — the punishment landed on the player who had made no
  // decision at all. Now the police only ever collect from someone who chose
  // to be holding, which is the difference between a bad beat and a bad call.
  camelloPorro: {
    id: 'camelloPorro',
    options: [
      { id: 'pillarPorro', givesItem: 'porro' },
      { id: 'dejarlo' },
    ],
  },
  camelloPastis: {
    id: 'camelloPastis',
    options: [
      { id: 'pillarPastis', givesItem: 'pastis' },
      { id: 'dejarlo' },
    ],
  },
  camelloFarlopa: {
    id: 'camelloFarlopa',
    options: [
      { id: 'pillarFarlopa', givesItem: 'farlopa' },
      { id: 'dejarlo' },
    ],
  },
  cacheo: { id: 'cacheo', vp: -3 },
  redada: { id: 'redada' },
  nada: { id: 'nada' },

  // --- Catch-up ------------------------------------------------------------

  /**
   * Both of these pay the seat with the fewest points to their name, and both
   * pay it **into the bank**, unmultiplied.
   *
   * They exist because a weekend can be decided before it is played. A player
   * arrested at the top of Saturday night sits out two earning phases while
   * the leader plays both, and no card in the deck could hand back a gap that
   * size -- so the rest of the weekend was arithmetic, not a game. Banking
   * directly is what lets them land: `resolveNight` zeroes the round pool of
   * anyone in a cell, so the ordinary VP path reaches everybody except the
   * exact player these are for.
   *
   * They read the whole field of players still in the running -- the cell and
   * the sofa included, the dead excluded -- rather than the room, because the
   * standing they are settling belongs to the match and not to the venue.
   *
   * La colecta is the flat one and the common one: the table has a whip-round
   * for whoever is having the worst weekend.
   */
  colecta: { id: 'colecta', vp: 6 },

  /**
   * La remontada is the rare one, and it is the only card in the game whose
   * value depends on the score. It hands back a share of the distance to the
   * leader, so it is worth almost nothing when the table is level and
   * genuinely worth drawing when somebody has been buried. The share and the
   * ceiling live in `COMEBACK`; a flat number could not do this job, because
   * the size of the hole is the whole point.
   */
  remontada: { id: 'remontada' },

  // --- Choice cards --------------------------------------------------------

  /**
   * Two penalties, and the sharpest card in the set: resaca is expensive on
   * Friday and nearly free on Sunday night, so the same card asks a different
   * question depending on how much weekend is left to ruin.
   */
  ultimaRonda: {
    id: 'ultimaRonda',
    options: [
      { id: 'unaMas', intox: 4 },
      { id: 'mananaLoPago', resaca: 2 },
    ],
  },

  /** The resaca sink. Buying your way out of a bad Friday costs points. */
  resacon: {
    id: 'resacon',
    options: [
      { id: 'dormirla', resaca: -2, vp: -3 },
      { id: 'seguirDeFiesta' },
    ],
  },

  /** Two bonuses: cash now, or something to spend later. */
  invitacion: {
    id: 'invitacion',
    options: [
      { id: 'cobrarla', vp: 3 },
      { id: 'pillarKebab', givesItem: 'kebab' },
    ],
  },

  /**
   * Press your luck. Reuses the Pastis doubler rather than inventing a second
   * "double this drink" path, so the extra card lands at double VP and full
   * intoxication — you are betting capacity you may not have.
   */
  dobleONada: {
    id: 'dobleONada',
    options: [
      { id: 'doblar', extraDrink: true, doubles: true },
      { id: 'pasar' },
    ],
  },

  /** Take the money and go home — forfeiting Último en Pie to do it. */
  saltarLaCola: {
    id: 'saltarLaCola',
    options: [
      { id: 'colarse', vp: 7, leaves: true },
      { id: 'hacerCola' },
    ],
  },
};

/** The branches this card offers, or null when it simply happens to you. */
export function eventOptions(id: EventId): readonly EventOption[] | null {
  return EVENTS[id].options ?? null;
}

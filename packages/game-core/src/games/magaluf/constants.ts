/**
 * The tuned rules constants.
 *
 * Every value here was settled by simulation in `prototypes/magaluf/` before
 * this module existed; `prototypes/magaluf/design.md` §13 records the runs.
 * The subset a host can override per match lives in `settings.ts`.
 */

import type { EventId, PhaseId } from './cards.js';

export interface PhaseRules {
  /** Max drinks per player before "closing time" auto-withdraws them. */
  maxDrinks: number;
  /** Drinks required to leave without the Aguafiestas penalty. */
  minDrinks: number;
  earlyExitPenalty: number;
  /** Requires meeting `minDrinks` — otherwise two Porros buy the bonus. */
  lastStandingBonus: number;
  alcohol: Record<string, number>;
  events: Partial<Record<EventId, number>>;
}

/**
 * The spread widens rather than the level falling.
 *
 * Lowering the limit does almost nothing to the death rate — players scale
 * their drinking to whatever capacity they have. What kills people is being
 * wrong about the number while it is face-down, so Friday's deck is tight and
 * Sunday's is wide.
 */
export const LIMIT_DECKS: Record<string, number[]> = {
  viernes: [26, 27, 28, 29],
  sabado: [20, 23, 26, 29],
  domingo: [14, 18, 22, 26],
};

/**
 * Multiplier on everything banked at the end of each day.
 *
 * Without this the weekend has no arc: a shrinking limit does not make later
 * days more dangerous because players simply drink less to match, so danger
 * has to come from temptation instead. It also stops Friday's banked VP
 * dominating the final score.
 */
export const DAY_VP_MULTIPLIER = [1, 1.5, 2.25];

export const BALCONING = {
  /** P(survive) at d = 1. The primary lethality dial. */
  basePoolChance: 0.7,
  /** How much survival drops per extra point over the limit. */
  poolDecay: 0.12,
  /** Legend bonus is `legendBase + d`, banked only if you survive. */
  legendBase: 3,
  /** Resaca taken by a player who survives the jump. */
  resaca: 4,
} as const;

export const ITEM_EFFECTS = {
  kebabRelief: 3,
  botellaRelief: 2,
  farlopaResaca: 3,
  /** Farlopa's extra draw also draws an Event card — it is a whole extra turn. */
  farlopaDrawsEvent: true,
} as const;

export const PHASE_RULES: Record<PhaseId, PhaseRules> = {
  tardeo: {
    maxDrinks: 4,
    minDrinks: 2,
    earlyExitPenalty: 2,
    lastStandingBonus: 2,
    alcohol: {
      cana: 6,
      tinto: 5,
      clara: 3,
      pinta: 4,
      vino: 4,
      vermut: 3,
      sangria: 3,
      mojito: 2,
      cubata: 2,
      chupito: 1,
      agua: 1,
    },
    // Events pay per draw, not per point of intoxication, and Tardeo drinks
    // are cheap — so this deck gets far more draws per point of capacity than
    // the After's. Its own low-value tier plus a thin VP density is what stops
    // the safest phase being the most profitable one.
    events: {
      ligueTardeo: 3,
      fiestaTardeo: 2,
      peleaTardeo: 2,
      chungoTardeo: 2,
      insolacion: 2,
      foto: 2,
      perdido: 2,
      chupitoCasa: 2,
      ronda: 2,
      vomitona: 1,
      kebabEvent: 2,
      aguaEvent: 2,
      redbullEvent: 2,
      camello: 5,
      cacheo: 1,
      nada: 4,
    },
  },

  noche: {
    maxDrinks: 5,
    minDrinks: 3,
    earlyExitPenalty: 4,
    lastStandingBonus: 3,
    alcohol: {
      cana: 2,
      pinta: 2,
      vino: 2,
      mojito: 3,
      cubata: 7,
      chupito: 4,
      gintonic: 5,
      coctel: 3,
      jager: 3,
      cargada: 2,
      agua: 1,
    },
    events: {
      ligueNoche: 3,
      fiestaNoche: 2,
      peleaNoche: 3,
      chungoNoche: 2,
      gorila: 2,
      garrafonEvent: 3,
      karaoke: 2,
      barraLibre: 2,
      reyGuiri: 2,
      perdido: 2,
      chupitoCasa: 3,
      ronda: 3,
      vomitona: 2,
      ambulancia: 1,
      kebabEvent: 2,
      aguaEvent: 1,
      camello: 7,
      cacheo: 1,
      redada: 1,
      nada: 1,
    },
  },

  after: {
    maxDrinks: 4,
    // 1 so that "show up, have one, go to bed" stays a legitimate cautious
    // play on Sunday.
    minDrinks: 1,
    earlyExitPenalty: 5,
    lastStandingBonus: 5,
    alcohol: {
      cubata: 3,
      chupito: 3,
      jager: 4,
      cargada: 3,
      hierbas: 3,
      tequila3: 4,
      absenta: 3,
      garrafon: 2,
      pecera: 2,
      agua: 1,
    },
    // No `nada`. Nothing in the After is ever nothing.
    events: {
      ligueAfter: 3,
      fiestaAfter: 2,
      peleaAfter: 3,
      chungoAfter: 2,
      soloVoyAMirar: 3,
      terraza: 2,
      comaEtilico: 2,
      karaoke: 2,
      barraLibre: 2,
      reyGuiri: 3,
      perdido: 1,
      chupitoCasa: 5,
      ronda: 5,
      garrafonEvent: 4,
      vomitona: 2,
      ambulancia: 2,
      kebabEvent: 1,
      camello: 8,
      cacheo: 1,
      redada: 2,
    },
  },
};

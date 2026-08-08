/**
 * Every tunable number in the game, in one file.
 *
 * Nothing else in the engine hardcodes a quantity. This is what the simulator
 * sweeps and what the web prototype's tuning panel edits, and when the design
 * settles it becomes the real module's constants plus its `settingsSchema`.
 */

import type { DayId, EventId, ItemId, PhaseId } from './cards.ts';

export interface PhaseConfig {
  /** Max drinks per player before "closing time" auto-withdraws them. */
  maxDrinks: number;
  /** Drinks required to leave without the Aguafiestas penalty. */
  minDrinks: number;
  /** VP lost for leaving below `minDrinks`. */
  earlyExitPenalty: number;
  /** VP for being the last to leave (requires meeting `minDrinks`). */
  lastStandingBonus: number;
  /** Card id -> copies in this phase's alcohol deck. */
  alcohol: Record<string, number>;
  /** Event id -> copies in this phase's event deck. */
  events: Partial<Record<EventId, number>>;
}

export interface Config {
  playerCount: number;

  /** When the day's face-down limit card is turned over. */
  limitRevealAt: PhaseId | 'never';
  /** Limit deck per day; one card is drawn each morning. */
  limitDecks: Record<DayId, number[]>;

  /**
   * Multiplier on everything banked at the end of each day.
   *
   * Without this the weekend has no arc. A shrinking limit does not make later
   * days more dangerous, because a rational player simply drinks less — the
   * simulator showed a flat death curve. Danger has to come from temptation
   * rather than from the dealer, so the last night has to be worth enough that
   * players choose to overreach. It also stops Friday's banked VP dominating
   * the final score, which is what let the Sunday leader win 78% of games.
   */
  dayVPMultiplier: number[];

  balconing: {
    /** P(survive) at d = 1. The primary lethality dial. */
    basePoolChance: number;
    /** How much survival drops per extra point over the limit. */
    decay: number;
    /** Legend bonus is `legendBase + d`, banked only if you survive. */
    legendBase: number;
    /** Resaca taken by a player who survives the jump. */
    resaca: number;
  };

  /**
   * Only Farlopa's Resaca lives here. Vomitona's and Ambulancia's live on
   * their cards in `cards.ts`, next to their flavour text — which is what
   * stops the two drifting apart, as they already did once.
   */
  resaca: {
    farlopa: number;
  };

  items: {
    kebabRelief: number;
    botellaRelief: number;
    /** Whether Farlopa's extra draw also draws an Event card. */
    farlopaDrawsEvent: boolean;
    /** Rounding for Farlopa's halved intoxication. */
    farlopaRounding: 'floor' | 'ceil';
  };

  phases: Record<PhaseId, PhaseConfig>;
}

export const defaultConfig: Config = {
  playerCount: 4,

  limitRevealAt: 'after',
  /**
   * Note the widening spread rather than a falling level.
   *
   * The simulator was unambiguous here: lowering the limit does almost nothing
   * to the death rate, because a rational player simply drinks less. What
   * actually kills people is being wrong about the number while it is still
   * face-down. Friday's deck is tight and predictable; Sunday's is wide, so a
   * player estimating 20 may be facing 14 and not find out until the After.
   */
  limitDecks: {
    viernes: [26, 27, 28, 29],
    sabado: [20, 23, 26, 29],
    domingo: [14, 18, 22, 26],
  },

  dayVPMultiplier: [1, 1.5, 2.25],

  // The balcony roll is a DIE, because this has to be playable on a table.
  // `base = (N-1)/N` and `decay = 1/N` collapse to exactly `(N - d)/N`, which
  // is the chance of rolling above `d` on a dN -- so these two numbers are not
  // free parameters, they are a d6 written the long way. Sweep another die with
  // `--die 4`; the shipped module names it `balconyDie`.
  balconing: {
    basePoolChance: 5 / 6,
    decay: 1 / 6,
    legendBase: 3,
    resaca: 4,
  },

  resaca: {
    farlopa: 3,
  },

  items: {
    kebabRelief: 3,
    botellaRelief: 2,
    farlopaDrawsEvent: true,
    farlopaRounding: 'floor',
  },

  phases: {
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
      // Events pay out per draw, not per point of intoxication, and Tardeo
      // drinks are cheap — so this deck gets many more draws per point of
      // capacity than the After's does. Its own low-value tier plus a thin VP
      // density is what stops the safest phase being the most profitable one.
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
        camelloPorro: 2,
        camelloPastis: 2,
        camelloFarlopa: 1,
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
      // Middle tier: rewards roughly double the Tardeo's, and the punishments
      // start actually costing something — a bouncer can end your phase and
      // the first Redada appears.
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
        camelloPorro: 2,
        camelloPastis: 3,
        camelloFarlopa: 2,
        cacheo: 1,
        redada: 1,
        nada: 1,
      },
    },

    after: {
      maxDrinks: 4,
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
      // Top tier: the biggest rewards in the game sitting next to the two
      // cards that can end a weekend on their own. No `nada` — nothing in the
      // After is ever nothing.
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
        camelloPorro: 2,
        camelloPastis: 2,
        camelloFarlopa: 4,
        cacheo: 1,
        redada: 2,
      },
    },
  },
};

/** Deep clone so callers can mutate a config without touching the default. */
export function cloneConfig(config: Config): Config {
  return JSON.parse(JSON.stringify(config)) as Config;
}

/** The item a Camello hands over, given what the player already carries. */
export const CAMELLO_POOL: readonly ItemId[] = ['porro', 'pastis', 'farlopa'];

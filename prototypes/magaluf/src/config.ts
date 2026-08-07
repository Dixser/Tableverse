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

  resaca: {
    vomitona: number;
    ambulancia: number;
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

  events: {
    ligueVP: number;
    ligueGrandeVP: number;
    espumaVP: number;
    karaokeVP: number;
    karaokeDrunkestVP: number;
    fotoVP: number;
    reyGuiriVP: number;
    soloVoyAMirarVP: number;
    movilAlMarVP: number;
    peleaVP: number;
    peleaIntox: number;
    garrafonIntox: number;
    vomitonaRelief: number;
    ambulanciaRelief: number;
    cacheoVP: number;
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

  balconing: {
    basePoolChance: 0.7,
    decay: 0.12,
    legendBase: 3,
    resaca: 4,
  },

  resaca: {
    vomitona: 3,
    ambulancia: 4,
    farlopa: 3,
  },

  items: {
    kebabRelief: 3,
    botellaRelief: 2,
    farlopaDrawsEvent: true,
    farlopaRounding: 'floor',
  },

  events: {
    ligueVP: 3,
    ligueGrandeVP: 5,
    espumaVP: 2,
    karaokeVP: 2,
    karaokeDrunkestVP: 4,
    fotoVP: 2,
    reyGuiriVP: 3,
    soloVoyAMirarVP: 5,
    movilAlMarVP: 3,
    peleaVP: 4,
    peleaIntox: 2,
    garrafonIntox: 3,
    vomitonaRelief: 4,
    ambulanciaRelief: 5,
    cacheoVP: 3,
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
      // Events pay out per draw, not per point of intoxication. Because Tardeo
      // drinks are cheap you get many more draws per point, so a VP-rich Tardeo
      // event deck made the safest phase the most profitable one. Its VP
      // density is deliberately thin.
      events: {
        ligue: 2,
        espuma: 1,
        foto: 2,
        karaoke: 1,
        barraLibre: 1,
        movilAlMar: 2,
        cartera: 1,
        perdido: 2,
        chupitoCasa: 2,
        ronda: 2,
        pelea: 1,
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
        ligue: 2,
        ligueGrande: 2,
        espuma: 2,
        karaoke: 2,
        foto: 2,
        barraLibre: 2,
        reyGuiri: 2,
        movilAlMar: 2,
        cartera: 1,
        perdido: 2,
        chupitoCasa: 3,
        ronda: 3,
        garrafonEvent: 2,
        pelea: 2,
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
      events: {
        ligueGrande: 4,
        soloVoyAMirar: 4,
        karaoke: 3,
        reyGuiri: 3,
        barraLibre: 2,
        movilAlMar: 2,
        cartera: 1,
        perdido: 1,
        chupitoCasa: 5,
        ronda: 5,
        garrafonEvent: 4,
        pelea: 3,
        vomitona: 2,
        ambulancia: 2,
        kebabEvent: 1,
        camello: 8,
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

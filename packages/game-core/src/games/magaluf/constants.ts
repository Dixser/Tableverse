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
 * One deck, the same every day.
 *
 * It used to narrow across the weekend — Friday 26–29 down to Sunday 14–26 —
 * on the theory that the danger should rise. Playtesting showed that punishes
 * the unlucky twice over: `resaca` is already an intoxication floor carried
 * forward, so the player who drew a Vomitona on Friday met Sunday's 14 with
 * capacity they never chose to spend, was forced out of every phase early, and
 * lost the day the 2.25× multiplier makes decisive. The comeback was gone by
 * Saturday lunchtime.
 *
 * So the weekend's arc is carried entirely by DAY_VP_MULTIPLIER below — which
 * is what that constant's own comment already claimed — and the limit is one
 * honest spread you learn once. Lowering it never did much to the death rate
 * anyway: players scale their drinking to whatever capacity they have. What
 * kills people is being wrong about the number while it is face-down, and a
 * five-card 16–28 spread is plenty wrong enough.
 */
export const LIMIT_DECK = [16, 19, 22, 25, 28];

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
  /** Legend bonus is `legendBase + d`, banked only if you survive. */
  legendBase: 3,
  /** Resaca taken by a player who survives the jump. */
  resaca: 4,
} as const;

/**
 * How many faces the balcony die has. The whole survival curve, in one
 * physical object: you survive by rolling strictly higher than how far over
 * the limit you went, so a dN gives `(N − d) / N` and becomes impossible at
 * `d = N`.
 *
 * d6 is the default on evidence: at 8,000 simulated games it kills 48.8% of
 * the players who go over and leaves 33.3% of the table dead by Monday, which
 * is within noise of the hand-tuned continuous curve it replaces. d4 is the
 * nastier table (40.5% dead by Monday); d10 and above stop being lethal
 * enough to earn the theme.
 */
export const BALCONY_DICE = [4, 6, 8, 10, 12, 20] as const;
export const DEFAULT_BALCONY_DIE = 6;

export const ITEM_EFFECTS = {
  kebabRelief: 3,
  botellaRelief: 2,
  farlopaResaca: 3,
  /** Farlopa's extra draw also draws an Event card — it is a whole extra turn. */
  farlopaDrawsEvent: true,
} as const;

/**
 * La remontada's two dials, set by probe rather than by feel.
 *
 * 200 simulated 4-player weekends across three drinking strategies put the
 * median winning score at ~66 and the median final leader-to-last gap at ~44.
 * (Not the 151 in `design.md` §13 — that figure is the pre-034 prototype's and
 * no longer describes this game.) Against that gap the catch-up pair returns a
 * median of 12 points a match, a bit over a quarter, and much more than that to
 * a player who has genuinely been buried.
 *
 * `gapDivisor: 2` — half the distance to the leader. Proportional is the whole
 * point: it is worth almost nothing early, when everyone is level, and only
 * bites once somebody is actually adrift.
 *
 * `maxVP: 20` — the ceiling stops a catastrophic first night from being
 * refunded outright. It binds from a gap of 40 up, which is about what a missed
 * Saturday night costs.
 *
 * These are a starting point for the next playtest, not a settled tuning. The
 * dial to turn first is the card counts in PHASE_RULES, which move how often
 * the pair fires at all; these two move only what it pays when it does.
 */
export const COMEBACK = { gapDivisor: 2, maxVP: 20 } as const;

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
      ligueTardeo: 2,
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
      // Choice cards, paid for out of `nada` and a Ligue. The Tardeo is where a
      // player who is already behind still has a whole weekend to spend, so it
      // carries the pair of Resacón that make Friday's hangover survivable.
      resacon: 2,
      invitacion: 1,
      dobleONada: 1,
      // The dealer's mix shifts across the weekend: mostly joints in the
      // daylight, mostly powder by the After. A single card that rolled
      // between three items could never express that; card counts can.
      camelloPorro: 2,
      camelloPastis: 2,
      camelloFarlopa: 1,
      cacheo: 1,
      nada: 1,
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
      ligueNoche: 2,
      fiestaNoche: 2,
      peleaNoche: 3,
      chungoNoche: 2,
      gorila: 2,
      garrafonEvent: 2,
      karaoke: 2,
      barraLibre: 2,
      perdido: 2,
      chupitoCasa: 2,
      ronda: 1,
      vomitona: 2,
      ambulancia: 1,
      kebabEvent: 2,
      aguaEvent: 1,
      camelloPorro: 2,
      camelloPastis: 3,
      camelloFarlopa: 2,
      cacheo: 1,
      redada: 1,
      // Paid for by trimming a forced drink, a Garrafón, and a Ligue. The
      // forced-drink cards are the right thing to trade away here: they are
      // the ones that spend your capacity without asking, which is the exact
      // complaint these cards exist to answer.
      ultimaRonda: 2,
      resacon: 1,
      invitacion: 1,
      dobleONada: 1,
      // Catch-up. The Noche is the earliest venue where a weekend can already
      // be decided -- an arrest here costs the rest of the day -- so it is the
      // earliest one that needs a way back. Paid for out of Rey del guiri's two
      // slots plus a Ronda, on feature 034's standing argument: the forced-drink
      // cards are the right thing to trade away, being the ones that spend a
      // player's capacity without asking. That trade also helps the seat these
      // cards are for, who is the least able to afford an unasked-for drink.
      colecta: 2,
      remontada: 1,
      // No `nada` left in the Noche. There was only ever one.
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
      ligueAfter: 2,
      fiestaAfter: 2,
      peleaAfter: 3,
      chungoAfter: 2,
      soloVoyAMirar: 3,
      terraza: 2,
      comaEtilico: 2,
      karaoke: 2,
      barraLibre: 2,
      perdido: 1,
      chupitoCasa: 4,
      ronda: 3,
      garrafonEvent: 3,
      vomitona: 2,
      ambulancia: 2,
      kebabEvent: 1,
      camelloPorro: 2,
      camelloPastis: 2,
      camelloFarlopa: 3,
      cacheo: 1,
      redada: 2,
      // Saltar la cola only lives here: cashing out and going home is only a
      // real decision in the venue where leaving costs you the biggest Último
      // en Pie in the game.
      ultimaRonda: 2,
      dobleONada: 1,
      saltarLaCola: 2,
      // Rey del guiri's other three slots, plus a Ronda. Weighted to the After
      // because this is where the weekend is actually decided: Sunday's x2.25
      // means a gap closed here is worth more than the same gap closed on
      // Friday, and it is the last venue in which anything can be closed.
      colecta: 2,
      remontada: 2,
    },
  },
};

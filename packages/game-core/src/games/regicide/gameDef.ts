import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameLogEntry, GameoverResult } from '../../types.js';
import { ActivePlayers, INVALID_MOVE } from '../../vendor.js';
import {
  beginRoundConfirm,
  confirmRoundReadyMove,
  forceAdvanceRoundMove,
  isRoundConfirmComplete,
  type RoundConfirmG,
} from '../../roundConfirm.js';
import {
  buildCastleRanks,
  buildTavernDeck,
  cardValue,
  enemyAttack,
  enemyHealth,
  MAX_HAND_SIZE,
  type Card,
  type FaceCard,
  type Suit,
} from './deck.js';
import { isLegalSelection } from './legalPlay.js';

export type { Card, Suit, FaceCard, NumberCard, CompanionCard, JesterCard, NumberRank, FaceRank } from './deck.js';

export interface RegicideG extends RoundConfirmG {
  /**
   * Every seat actually claimed by a real user at match-start time --
   * same pattern and same reason as Love Letter's/The Mind's field of the
   * same name: the platform always creates gameModule.maxPlayers (4)
   * engine seats regardless of how many are actually claimed.
   */
  activeSeatIDs: string[];

  /** Hidden from EVERY player and spectator, always -- nobody has looked. */
  _tavernDeck: Card[];
  /** Hidden from EVERY player and spectator, always -- remaining, unrevealed enemies. */
  _castleDeck: FaceCard[];

  /** Public. Null only in the instant between the 12th defeat and match end. */
  currentEnemy: FaceCard | null;
  /** Public, full contents (feature 023 chooses to render only its count). */
  discardPile: Card[];
  /** Public -- cards played against currentEnemy this round, not yet discarded. */
  cardsInPlay: Card[];
  /** Public, cumulative vs currentEnemy. Resets to 0 when a new enemy is revealed. */
  damageDealt: number;
  /**
   * Public, cumulative RAW attack value of every spade-containing
   * selection played against currentEnemy -- accumulated unconditionally,
   * even while the enemy is immune to spades. Immunity is applied only
   * when this is READ (see isImmune's use in enterStep4), which is what
   * produces the rulebook's retroactive-unlock-by-Jester behavior for
   * free. Resets to 0 when a new enemy is revealed.
   */
  spadeShieldTotal: number;
  /** Public. True once a Jester has been played against currentEnemy. Resets on a new enemy. */
  enemyImmunityCancelled: boolean;

  /** Per-player secret -- conformance suite secretKey. */
  hands: Record<string, Card[]>;
  /** Public, per active seat. Whether that seat's most recently completed turn was a yield. */
  lastActionWasYield: Record<string, boolean>;
  /** Public. Non-null only while the active player is in the `defend` stage. */
  pendingDefense: { requiredTotal: number } | null;
  /**
   * Public. Set by resolveEnemyDefeat for a non-final defeat; consumed and
   * cleared by the roundConfirm phase's onEnd, which is where the
   * defeated card actually moves, the next enemy is revealed, and the
   * per-enemy counters reset -- deferred so `currentEnemy` keeps showing
   * the just-defeated card (and the damage/shield that finished it) for
   * the whole confirmation wait. Null whenever no defeat is pending.
   */
  pendingEnemyDisposal: 'tavern' | 'discard' | null;
  /** Jester's one-shot next-player override, consumed by turn.order.next then cleared in onBegin. */
  forcedNextSeatID: string | null;
  /** Input to combat phase's turn.order.first -- the match's random starting seat, or the last defeat's winner. */
  nextTurnStartSeatID: string | null;

  log: GameLogEntry[];
  /** Set once the match is actually over; read by the top-level endIf. */
  matchResult: 'won' | 'lost' | null;
}

export interface RegicideView extends Omit<RegicideG, '_tavernDeck' | '_castleDeck' | 'hands'> {
  tavernCount: number;
  /** 1-indexed position of currentEnemy in the 12-card Castle deck (e.g. 3 means "enemy 3 of 12"). */
  enemyNumber: number;
  /** Every active seat's hand SIZE -- public, unlike the hand contents themselves. */
  handCounts: Record<string, number>;
  hands: Record<string, Card[]>;
}

export interface RegicideSetupData {
  /** Seats actually claimed when the match was started -- see RegicideG.activeSeatIDs. */
  claimedSeatIDs?: string[];
  /** The host's own seat, if any -- see RoundConfirmG.hostPlayerID. */
  hostPlayerID?: string | null;
}

/** The subset of boardgame.io's EventsAPI this game's moves actually use. */
interface CombatEvents {
  endTurn(): void;
  setStage(stage: string): void;
  endStage(): void;
}

type ShuffleFn = { Shuffle<T>(deck: T[]): T[] };

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

function validateRegicideSetupData(
  setupData: RegicideSetupData | undefined,
  numPlayers: number,
): string | undefined {
  const effectiveCount = setupData?.claimedSeatIDs?.length ?? numPlayers;
  if (effectiveCount < 2 || effectiveCount > 4) {
    return `regicide-v1: supports 2-4 players, got ${effectiveCount}`;
  }
  return undefined;
}

function removeFromHand(hand: Card[], cardID: string): Card | undefined {
  const index = hand.findIndex((c) => c.id === cardID);
  if (index === -1) return undefined;
  return hand.splice(index, 1)[0];
}

/**
 * Whether currentEnemy is immune to suit -- same suit, and not yet
 * cancelled by a Jester. Exported (unlike the rest of this file's
 * internals) so EnemyPanel's "damage you'll take" display can apply the
 * exact same immunity check enterStep4 uses below, rather than a second,
 * independently-written copy of it that could silently drift out of sync
 * -- see EnemyPanel.tsx's own doc comment on effectiveSpadeShieldTotal for
 * the bug this fixes (Spades enemy + a Spades card played against it
 * accumulates spadeShieldTotal same as any other enemy, but that raw
 * total has zero effect on the required discard once immune, which the
 * displayed number must also reflect).
 */
export function isSuitImmune(
  currentEnemy: FaceCard,
  suit: Suit,
  enemyImmunityCancelled: boolean,
): boolean {
  return currentEnemy.suit === suit && !enemyImmunityCancelled;
}

function isImmune(G: RegicideG, suit: Suit): boolean {
  return isSuitImmune(G.currentEnemy!, suit, G.enemyImmunityCancelled);
}

function yieldAllowed(G: RegicideG, playerID: string): boolean {
  const others = G.activeSeatIDs.filter((id) => id !== playerID);
  return !others.every((id) => G.lastActionWasYield[id] === true);
}

/**
 * Step 1's "stuck" loss trigger (spec.md AC12): only possible with an
 * empty hand, since any single card is always a legal Step 1 play (see
 * legalPlay.ts) -- checked at the start of every turn, not inside a move,
 * since it's a precondition of the turn even having a legal action, not a
 * rejected move attempt.
 */
function checkStuckLoss(G: RegicideG, ctx: Ctx): void {
  if (G.matchResult) return;
  const playerID = ctx.currentPlayer;
  if (!G.activeSeatIDs.includes(playerID)) return;
  if (G.hands[playerID]!.length > 0) return;
  if (yieldAllowed(G, playerID)) return;
  G.matchResult = 'lost';
  G.log.push({ key: 'regicide.log.matchLostStuck', params: { actor: playerID } });
}

const regicideTurnOrder: TurnOrderConfig<RegicideG> = {
  first: ({ G, ctx }) => {
    const startID = G.nextTurnStartSeatID ?? ctx.playOrder[0]!;
    return ctx.playOrder.indexOf(startID);
  },
  next: ({ G, ctx }) => {
    if (G.forcedNextSeatID != null) {
      const idx = ctx.playOrder.indexOf(G.forcedNextSeatID);
      if (idx !== -1) return idx;
    }
    const order = ctx.playOrder;
    for (let step = 1; step <= order.length; step++) {
      const candidateIdx = (ctx.playOrderPos + step) % order.length;
      if (G.activeSeatIDs.includes(order[candidateIdx]!)) return candidateIdx;
    }
    return undefined; // no eligible seat -- endIf will already have ended the match by now.
  },
};

// --- Setup ---------------------------------------------------------------

function buildInitialG(
  ctx: Ctx,
  activeSeatIDs: string[],
  hostPlayerID: string | null,
): RegicideG {
  const seats = seatIDs(ctx);
  return {
    activeSeatIDs,
    roundConfirm: null,
    hostPlayerID,
    _tavernDeck: [],
    _castleDeck: [],
    currentEnemy: null,
    discardPile: [],
    cardsInPlay: [],
    damageDealt: 0,
    spadeShieldTotal: 0,
    enemyImmunityCancelled: false,
    hands: Object.fromEntries(seats.map((id) => [id, []])),
    lastActionWasYield: Object.fromEntries(activeSeatIDs.map((id) => [id, false])),
    pendingDefense: null,
    pendingEnemyDisposal: null,
    forcedNextSeatID: null,
    nextTurnStartSeatID: null,
    log: [],
    matchResult: null,
  };
}

function setupGame(G: RegicideG, ctx: Ctx, random: ShuffleFn): void {
  const seats = seatIDs(ctx);
  const playerCount = G.activeSeatIDs.length;

  const tavernDeck = random.Shuffle(buildTavernDeck(playerCount));
  const maxHandSize = MAX_HAND_SIZE[playerCount]!;
  const hands: Record<string, Card[]> = {};
  for (const id of seats) {
    if (!G.activeSeatIDs.includes(id)) {
      hands[id] = [];
      continue;
    }
    const hand: Card[] = [];
    for (let i = 0; i < maxHandSize; i++) hand.push(tavernDeck.pop()!);
    hands[id] = hand;
  }
  G.hands = hands;
  G._tavernDeck = tavernDeck;

  const { jacks, queens, kings } = buildCastleRanks();
  // pop() draws from the END of the array -- Kings go at the front so
  // Jacks (the end, after concatenation) are revealed first.
  G._castleDeck = [
    ...random.Shuffle(kings),
    ...random.Shuffle(queens),
    ...random.Shuffle(jacks),
  ];
  G.currentEnemy = G._castleDeck.pop()!;

  G.nextTurnStartSeatID = random.Shuffle(G.activeSeatIDs)[0]!;
}

// --- Step 2/3/4 resolution -------------------------------------------------

/** Hearts: shuffle the discard pile, move up to `total` cards under (the bottom of) the Tavern deck. */
function resolveHearts(G: RegicideG, total: number, random: ShuffleFn): void {
  const shuffled = random.Shuffle(G.discardPile);
  const moveCount = Math.min(total, shuffled.length);
  const toTavern = shuffled.slice(0, moveCount);
  G.discardPile = shuffled.slice(moveCount);
  G._tavernDeck.unshift(...toTavern); // opposite end from pop() -- the new bottom.
}

/**
 * Diamonds: one card at a time, starting with playerID and proceeding
 * clockwise among active seats, skipping any seat already at max hand
 * size, stopping once `total` cards have been drawn, the Tavern deck
 * empties, or every active seat is at max hand size (nobody left to
 * receive one) -- whichever comes first. No penalty for any of these.
 */
function resolveDiamonds(G: RegicideG, ctx: Ctx, playerID: string, total: number): void {
  const order = ctx.playOrder.filter((id) => G.activeSeatIDs.includes(id));
  const startIdx = order.indexOf(playerID);
  const maxHandSize = MAX_HAND_SIZE[G.activeSeatIDs.length]!;
  let remaining = total;
  let offset = 0;
  while (remaining > 0 && G._tavernDeck.length > 0) {
    let drewThisPass = false;
    for (let k = 0; k < order.length; k++) {
      const seat = order[(startIdx + offset) % order.length]!;
      offset++;
      if (G.hands[seat]!.length < maxHandSize) {
        G.hands[seat]!.push(G._tavernDeck.pop()!);
        remaining--;
        drewThisPass = true;
        break;
      }
    }
    if (!drewThisPass) break; // every active seat is at max hand size.
  }
}

function enterStep4(
  G: RegicideG,
  playerID: string,
  events: CombatEvents,
): void {
  const effectiveShield = isImmune(G, 'S') ? 0 : G.spadeShieldTotal;
  const required = Math.max(0, enemyAttack(G.currentEnemy!) - effectiveShield);
  if (required <= 0) {
    events.endTurn();
    return;
  }
  const handTotal = G.hands[playerID]!.reduce((sum, c) => sum + cardValue(c), 0);
  if (handTotal < required) {
    // Capability check, not a rejected move -- see plan.md. The whole
    // hand couldn't reach `required` even fully discarded, so the loss is
    // certain regardless of what discardCards selection would be sent.
    G.matchResult = 'lost';
    G.log.push({ key: 'regicide.log.matchLostDefense', params: { actor: playerID, required } });
    return;
  }
  G.pendingDefense = { requiredTotal: required };
  events.setStage('defend');
}

/**
 * Only does the part of a defeat that doesn't change what's on screen --
 * and (only for the 12th/final enemy) ends the match outright. For every
 * other enemy, `currentEnemy`/`damageDealt`/`spadeShieldTotal`/
 * `cardsInPlay` are ALL deliberately left untouched here: the defeated
 * card keeps showing the numbers (and the cards) that finished it for
 * the whole roundConfirm wait (spec.md's "Round-defeat confirmation" --
 * feature 023's PlayedCardsZone specifically renders `cardsInPlay`, so
 * clearing it here would blank that zone the instant the enemy dies,
 * before anyone had a chance to see what won the round). The rest of the
 * transition -- placing the defeated card, moving this round's played
 * cards to the discard pile, revealing the next enemy, resetting the
 * per-enemy counters -- is deferred to the roundConfirm phase's own
 * onEnd (see gameDef's phases block below), driven by
 * `pendingEnemyDisposal` set here.
 */
function resolveEnemyDefeat(G: RegicideG, defeatingPlayerID: string): void {
  const enemy = G.currentEnemy!;
  const exact = G.damageDealt === enemyHealth(enemy);
  G.log.push({
    key: 'regicide.log.enemyDefeated',
    params: { actor: defeatingPlayerID, enemy: enemy.id, damage: G.damageDealt },
  });

  if (G._castleDeck.length === 0) {
    // This WAS the 12th/final enemy -- the match ends immediately (no
    // roundConfirm wait, no next round to defer to), so this round's
    // played cards go straight to the discard pile here instead.
    G.discardPile.push(...G.cardsInPlay);
    G.cardsInPlay = [];
    if (exact) G._tavernDeck.push(enemy); else G.discardPile.push(enemy);
    G.currentEnemy = null;
    G.matchResult = 'won';
    G.log.push({ key: 'regicide.log.matchWon' });
    return;
  }

  G.pendingEnemyDisposal = exact ? 'tavern' : 'discard';
  G.nextTurnStartSeatID = defeatingPlayerID;
  beginRoundConfirm(G, G.activeSeatIDs);
}

// --- Moves -----------------------------------------------------------------

/**
 * client: false -- Diamonds draws write into OTHER active seats' hidden
 * G.hands entries, and Hearts reads/rewrites the blanket-hidden
 * G._tavernDeck. boardgame.io's default optimistic client-side dry-run
 * would otherwise run this against the caller's own already-playerView-
 * filtered copy of G and throw or mispredict -- same reasoning as Love
 * Letter's/The Mind's own playCard/playCard.
 */
function playCards(
  { G, ctx, playerID, events, random }: { G: RegicideG; ctx: Ctx; playerID: string; events: CombatEvents; random: ShuffleFn },
  cardIds: string[],
  params: { jesterNextPlayerID?: string } = {},
): typeof INVALID_MOVE | void {
  if (G.matchResult) return INVALID_MOVE;
  if (!Array.isArray(cardIds) || cardIds.length === 0) return INVALID_MOVE;
  if (new Set(cardIds).size !== cardIds.length) return INVALID_MOVE;

  const hand = G.hands[playerID];
  if (!hand) return INVALID_MOVE;
  const selection: Card[] = [];
  for (const id of cardIds) {
    const card = hand.find((c) => c.id === id);
    if (!card) return INVALID_MOVE;
    selection.push(card);
  }
  if (!isLegalSelection(selection)) return INVALID_MOVE;

  const isJesterPlay = selection.length === 1 && selection[0]!.kind === 'jester';
  if (isJesterPlay) {
    if (params.jesterNextPlayerID === undefined || !G.activeSeatIDs.includes(params.jesterNextPlayerID)) {
      return INVALID_MOVE;
    }
  } else if (params.jesterNextPlayerID !== undefined) {
    return INVALID_MOVE; // only meaningful for a Jester play.
  }

  G.lastActionWasYield[playerID] = false;
  for (const c of selection) removeFromHand(hand, c.id);
  G.cardsInPlay.push(...selection);

  if (isJesterPlay) {
    G.enemyImmunityCancelled = true;
    G.log.push({ key: 'regicide.log.jesterPlayed', params: { actor: playerID } });
    G.forcedNextSeatID = params.jesterNextPlayerID!;
    events.endTurn();
    return;
  }

  const totalAttack = selection.reduce((sum, c) => sum + cardValue(c), 0);
  const suits = new Set(
    selection
      .filter((c): c is Exclude<Card, { kind: 'jester' }> => c.kind !== 'jester')
      .map((c) => c.suit),
  );

  G.log.push({
    key: 'regicide.log.cardsPlayed',
    params: { actor: playerID, cards: cardIds.join(','), total: totalAttack },
  });

  if (suits.has('H') && !isImmune(G, 'H')) resolveHearts(G, totalAttack, random);
  if (suits.has('D') && !isImmune(G, 'D')) resolveDiamonds(G, ctx, playerID, totalAttack);
  if (suits.has('S')) {
    // Raw total always accumulates -- immunity gates only the EFFECTIVE
    // shield when read in enterStep4 (see RegicideG.spadeShieldTotal's doc).
    G.spadeShieldTotal += totalAttack;
  }

  const clubsDouble = suits.has('C') && !isImmune(G, 'C');
  const damage = clubsDouble ? totalAttack * 2 : totalAttack;
  G.damageDealt += damage;

  if (G.damageDealt >= enemyHealth(G.currentEnemy!)) {
    // No events.endTurn() here, deliberately -- unlike every other branch in
    // this file, a defeat must NOT hand the turn to the next seat in order.
    // resolveEnemyDefeat already set G.roundConfirm (non-final enemy) or
    // G.matchResult (final enemy), which trips combat.endIf/the top-level
    // endIf on their own once this move returns; boardgame.io ends the
    // current turn as part of that phase/game transition without ever
    // calling turn.order.next. Calling endTurn() here would advance
    // ctx.currentPlayer to the next active seat AND run combat.turn.onBegin
    // (checkStuckLoss) for that phantom seat before the transition even
    // happens -- a real player who never got a turn could be judged stuck
    // and lose the match on their behalf. The defeating player's actual
    // resumption is handled separately by G.nextTurnStartSeatID, consumed
    // by regicideTurnOrder.first (also reused by the roundConfirm phase's
    // own turn.order, below) once combat resumes.
    resolveEnemyDefeat(G, playerID);
    return;
  }

  enterStep4(G, playerID, events);
}

/** client: false -- see playCards' own note; yield can still enter Step 4, which reads shared enemy state. */
function yieldTurn(
  { G, playerID, events }: { G: RegicideG; ctx: Ctx; playerID: string; events: CombatEvents },
): typeof INVALID_MOVE | void {
  if (G.matchResult) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(playerID)) return INVALID_MOVE;
  if (!yieldAllowed(G, playerID)) return INVALID_MOVE;

  G.lastActionWasYield[playerID] = true;
  G.log.push({ key: 'regicide.log.yielded', params: { actor: playerID } });
  enterStep4(G, playerID, events);
}

/** client: false -- see playCards' own note. */
function discardCards(
  { G, playerID, events }: { G: RegicideG; ctx: Ctx; playerID: string; events: CombatEvents },
  cardIds: string[],
): typeof INVALID_MOVE | void {
  if (!G.pendingDefense) return INVALID_MOVE;
  if (!Array.isArray(cardIds) || cardIds.length === 0) return INVALID_MOVE;
  if (new Set(cardIds).size !== cardIds.length) return INVALID_MOVE;

  const hand = G.hands[playerID];
  if (!hand) return INVALID_MOVE;
  const selection: Card[] = [];
  for (const id of cardIds) {
    const card = hand.find((c) => c.id === id);
    if (!card) return INVALID_MOVE;
    selection.push(card);
  }
  const total = selection.reduce((sum, c) => sum + cardValue(c), 0);
  if (total < G.pendingDefense.requiredTotal) return INVALID_MOVE;

  for (const c of selection) removeFromHand(hand, c.id);
  G.discardPile.push(...selection);
  G.log.push({ key: 'regicide.log.suffered', params: { actor: playerID, total } });
  G.pendingDefense = null;
  events.endStage();
  events.endTurn();
}

// --- Game definition -----------------------------------------------------

function matchGameoverResult(G: RegicideG): GameoverResult | undefined {
  if (G.matchResult === 'won') return { winner: G.activeSeatIDs };
  if (G.matchResult === 'lost') return {};
  return undefined;
}

export const regicideGameDef: Game<RegicideG, Record<string, unknown>, RegicideSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateRegicideSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);
    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const G = buildInitialG(ctx, activeSeatIDs, setupData?.hostPlayerID ?? null);
    setupGame(G, ctx, random);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateRegicideSetupData(setupData, numPlayers),

  phases: {
    combat: {
      start: true,
      endIf: ({ G }) => G.roundConfirm !== null,
      next: () => 'roundConfirm',
      turn: {
        order: regicideTurnOrder,
        onBegin: ({ G, ctx }) => {
          G.forcedNextSeatID = null;
          checkStuckLoss(G, ctx);
        },
        stages: {
          defend: {
            moves: { discardCards: { move: discardCards, client: false } },
          },
        },
      },
      moves: {
        playCards: { move: playCards, client: false },
        yield: { move: yieldTurn, client: false },
      },
    },
    // Pause between a non-final enemy's defeat (resolveEnemyDefeat, above)
    // and the defeating player's bonus turn against the next enemy --
    // every active seat must confirm (or the host force-advance) before
    // play resumes. Nothing is dealt here (see spec.md's "Round-defeat
    // confirmation") -- this exists purely so everyone sees the final
    // resolved state before it's replaced. Deliberately a separate phase,
    // not a stage bolted onto `combat`, mirroring Love Letter's own
    // roundConfirm phase for the same "setActivePlayers can't be layered
    // onto an existing phase's turn via a stage" reason.
    roundConfirm: {
      // Reuses combat's own turn order (not boardgame.io's phase-default
      // TurnOrder.DEFAULT) so that entering this phase resolves
      // ctx.currentPlayer via regicideTurnOrder.first -- i.e. G.
      // nextTurnStartSeatID, the defeating player -- instead of DEFAULT's
      // "whoever's one seat after wherever playOrderPos was left" guess.
      // Without this, the board's "current turn" display would show the
      // wrong player for the whole roundConfirm wait even though nothing
      // here actually depends on ctx.currentPlayer for move authorization
      // (activePlayers: ALL already lets every seat confirm).
      turn: { order: regicideTurnOrder, activePlayers: ActivePlayers.ALL },
      endIf: ({ G }) => isRoundConfirmComplete(G.roundConfirm),
      // The deferred half of resolveEnemyDefeat (see its own doc comment)
      // -- runs once every seat has confirmed (or the host force-advanced).
      onEnd: ({ G }) => {
        G.roundConfirm = null;
        const defeated = G.currentEnemy!;
        if (G.pendingEnemyDisposal === 'tavern') {
          G._tavernDeck.push(defeated); // top, under pop()-is-draw convention.
        } else {
          G.discardPile.push(defeated);
        }
        G.pendingEnemyDisposal = null;
        // The just-finished round's played cards -- deliberately left in
        // place through the whole roundConfirm wait (see
        // resolveEnemyDefeat's own doc comment) so PlayedCardsZone keeps
        // showing what won the round right up until the next one actually
        // starts, here.
        G.discardPile.push(...G.cardsInPlay);
        G.cardsInPlay = [];
        // Always defined -- resolveEnemyDefeat only opens this wait when
        // _castleDeck still has a next enemy to reveal.
        G.currentEnemy = G._castleDeck.pop()!;
        G.damageDealt = 0;
        G.spadeShieldTotal = 0;
        G.enemyImmunityCancelled = false;
      },
      next: () => 'combat',
      moves: {
        confirmRoundReady: confirmRoundReadyMove,
        forceAdvanceRound: forceAdvanceRoundMove,
      },
    },
  },

  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    const { _tavernDeck, _castleDeck, hands, ...publicG } = G;
    const view: RegicideView = {
      ...publicG,
      tavernCount: _tavernDeck.length,
      enemyNumber: 12 - _castleDeck.length,
      handCounts: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.length])),
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
    };
    return view;
  },
};

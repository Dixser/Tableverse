import { INVALID_MOVE } from './vendor.js';

/**
 * Generic "wait for every player to confirm before the next round/level
 * deals" mechanism, shared across games rather than reimplemented per game
 * -- see spec/021-rematch-round-confirm. A game embeds `RoundConfirmG` into
 * its own G (reserved field names, same convention as GameLogEntry/G.log)
 * and wires these primitives into its own moves/phases; how a game enters
 * and exits the wait differs by its own turn/phase architecture (Love
 * Letter uses a dedicated boardgame.io phase, The Mind -- which has no
 * phase machinery at all -- checks completion directly inside these same
 * moves), but the pending/confirmed bookkeeping and force-advance
 * authorization live here once, not duplicated per game.
 */
export interface RoundConfirmState {
  /** Seats required to confirm before the next round/level begins --
   * fixed at the moment the round/level ended (a game's own activeSeatIDs
   * at that point), not re-evaluated afterward. */
  pendingSeatIDs: string[];
  /** Subset of pendingSeatIDs that have confirmed so far. */
  confirmedSeatIDs: string[];
}

export interface RoundConfirmG {
  /** Null when no round/level-end wait is in progress. */
  roundConfirm: RoundConfirmState | null;
  /**
   * Snapshot of which seat the room's host occupied at match-start
   * (roomService.startMatch's setupData) -- null if the host wasn't
   * seated. Not a live binding to Room.hostUserID; there's no host-
   * transfer feature today, but if one's ever added mid-match this would
   * go stale for the rest of the match. Used to authorize
   * forceAdvanceRoundMove: only this seat may skip waiting on the rest.
   */
  hostPlayerID: string | null;
}

/** Starts a new wait -- called by a game once its round/level actually
 * ends, instead of dealing the next one immediately. */
export function beginRoundConfirm<G extends RoundConfirmG>(G: G, activeSeatIDs: string[]): void {
  G.roundConfirm = { pendingSeatIDs: [...activeSeatIDs], confirmedSeatIDs: [] };
}

/** True once every pending seat has confirmed. False (not an error) when
 * there's no wait in progress at all. */
export function isRoundConfirmComplete(state: RoundConfirmState | null): boolean {
  if (!state) return false;
  return state.pendingSeatIDs.every((id) => state.confirmedSeatIDs.includes(id));
}

/**
 * Marks the caller's own seat confirmed. INVALID_MOVE if there's no wait
 * in progress, or the caller's seat isn't one of the ones being waited on
 * (already confirmed, a phantom seat, or the round already advanced).
 * Idempotent -- confirming twice is a no-op, not an error, so a client
 * retry/double-click can't corrupt the count.
 *
 * Deliberately does NOT itself decide what happens once every seat has
 * confirmed (dealing the next round/level) -- that's necessarily
 * game-specific and left to the caller, checked via
 * isRoundConfirmComplete either from a wrapping boardgame.io phase's own
 * endIf/onEnd (Love Letter) or directly after calling this move (The
 * Mind, which has no phase machinery to lean on).
 */
export function confirmRoundReadyMove<G extends RoundConfirmG>({
  G,
  playerID,
}: {
  G: G;
  playerID: string;
}): typeof INVALID_MOVE | void {
  if (!G.roundConfirm || !G.roundConfirm.pendingSeatIDs.includes(playerID)) {
    return INVALID_MOVE;
  }
  if (!G.roundConfirm.confirmedSeatIDs.includes(playerID)) {
    G.roundConfirm.confirmedSeatIDs.push(playerID);
  }
}

/**
 * Marks every still-pending seat confirmed at once, skipping the wait for
 * whoever hasn't (e.g. a disconnected player). INVALID_MOVE unless the
 * caller's own seat is the match's host seat (`G.hostPlayerID`) -- if the
 * host isn't seated in this match, `hostPlayerID` is null and this move
 * can never be authorized by anyone, consistent with how a spectating
 * host already can't call any other move either (no match credentials).
 * Same "caller decides what happens next" contract as
 * confirmRoundReadyMove above.
 */
export function forceAdvanceRoundMove<G extends RoundConfirmG>({
  G,
  playerID,
}: {
  G: G;
  playerID: string;
}): typeof INVALID_MOVE | void {
  // hostPlayerID === null must never authorize anyone, even a caller whose
  // own playerID is also somehow null/falsy -- checked explicitly rather
  // than relying on `playerID !== G.hostPlayerID` alone, which a
  // null-vs-null comparison would otherwise let slip through.
  if (!G.roundConfirm || G.hostPlayerID === null || playerID !== G.hostPlayerID) {
    return INVALID_MOVE;
  }
  for (const id of G.roundConfirm.pendingSeatIDs) {
    if (!G.roundConfirm.confirmedSeatIDs.includes(id)) {
      G.roundConfirm.confirmedSeatIDs.push(id);
    }
  }
}

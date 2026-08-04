import { useEffect, useRef } from 'react';
import { extractGameLogEntries, type BoardProps } from '@tableverse/game-core';
import { playCue } from './soundPlayer.js';
import { resolveGameoverCue, type OutcomeCue } from './resolveGameoverCue.js';

interface TurnMemory {
  /** Which seat `wasActive` describes. Without this, switching the focused
   * seat reads as a turn change -- see the effect below. */
  seatID: string | null;
  wasActive: boolean;
}

/**
 * Plays sound cues for one mounted match. Side-effect only -- renders
 * nothing, returns nothing.
 *
 * Two layers, per spec/features/030-sound-cues:
 *  - Platform cues (turn, round, win/lose/draw) derived from state the
 *    platform already reads, so no GameModule writes any code for them.
 *  - Per-game cues, read from the optional `sound` field on the G.log
 *    entries a game already emits. This never inspects entry.key, so no
 *    game identity leaks into platform code.
 *
 * Every effect is keyed on primitives: `boardProps` is rebuilt fresh on
 * every render by useSeatClients, so depending on it referentially would
 * re-run on every render.
 */
export function useGameSounds(boardProps: BoardProps | null): void {
  const turnRef = useRef<TurnMemory | null>(null);
  const roundRef = useRef<boolean | null>(null);
  const outcomeRef = useRef<OutcomeCue | null>(null);
  const heardCountRef = useRef<number | null>(null);

  const hasMatch = boardProps !== null;
  const isActive = boardProps?.isActive ?? null;
  const playerID = boardProps?.playerID ?? null;

  const G = boardProps?.G as { log?: unknown; roundConfirm?: unknown } | undefined;
  const entries = extractGameLogEntries(G?.log);
  const entryCount = entries.length;
  const roundPending = G?.roundConfirm != null;
  const outcomeCue = boardProps ? resolveGameoverCue(boardProps.ctx.gameover, playerID) : null;

  // Turn: a false -> true edge for the SAME seat. A first observation, or
  // one whose playerID differs from what was last seen, re-baselines
  // silently -- SeatSwitcher swaps which seat feeds boardProps without
  // nulling it, so without the seat check every seat switch would ping.
  useEffect(() => {
    if (isActive === null) {
      turnRef.current = null;
      return;
    }
    const previous = turnRef.current;
    turnRef.current = { seatID: playerID, wasActive: isActive };
    if (!previous || previous.seatID !== playerID) return;
    if (!previous.wasActive && isActive) playCue('turn');
  }, [isActive, playerID]);

  // Round: G.roundConfirm going null -> non-null, which is exactly when
  // RoundConfirmBanner appears. A game with no roundConfirm field never
  // leaves false, so Tic-Tac-Toe and Cahoots are silent with no special
  // case. Not gated on playerID -- a round ending is a fact about the
  // table, so spectators hear it too.
  useEffect(() => {
    if (!hasMatch) {
      roundRef.current = null;
      return;
    }
    const previous = roundRef.current;
    roundRef.current = roundPending;
    if (previous === null) return;
    if (!previous && roundPending) playCue('round');
  }, [roundPending, hasMatch]);

  // Outcome: plays once when the resolved cue goes null -> non-null. Not
  // baselined on first observation, deliberately: GameoverBanner also
  // re-renders for someone who reloads into a finished match, and the
  // stinger is that banner's audible half.
  useEffect(() => {
    if (outcomeCue === null) {
      outcomeRef.current = null;
      return;
    }
    if (outcomeRef.current === outcomeCue) return;
    outcomeRef.current = outcomeCue;
    playCue(outcomeCue);
  }, [outcomeCue]);

  // Log: entries appended since the last observation. `entries` is
  // intentionally not a dependency -- G.log is append-only per its
  // contract, so its length is the only signal that matters (the same
  // reasoning, and the same lint-visible shape, as ChatPanel's stampedLog).
  useEffect(() => {
    if (!hasMatch) {
      heardCountRef.current = null;
      return;
    }
    const heard = heardCountRef.current;
    // heard === null: first sight of this match, so everything already
    // there is history and must stay silent (unlike ChatPanel, which does
    // stamp its initial batch -- right for rendering, wrong for sound).
    // entryCount < heard: a rematch reset the log; re-baseline instead of
    // replaying it.
    if (heard === null || entryCount < heard) {
      heardCountRef.current = entryCount;
      return;
    }
    if (entryCount === heard) return;
    heardCountRef.current = entryCount;
    for (const entry of entries.slice(heard)) {
      if (entry.sound) playCue(entry.sound);
    }
  }, [entryCount, hasMatch]);
}

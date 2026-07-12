import type { SeatStatusChangedEvent } from '@tableverse/shared';
import { PresenceStore } from './presenceStore.js';
import { DEFAULT_GRACE_PERIOD_MS, GracePeriodTimers } from './presenceTimers.js';

export type PresenceBroadcaster = (event: SeatStatusChangedEvent) => void;

/**
 * Composes PresenceStore + GracePeriodTimers into the seat presence state
 * machine from tech-stack.md/plan.md: connected -> grace_period ->
 * released (release-eligible, never auto-freed — the host must act via
 * seatService.releaseSeat). Broadcasts every transition through the
 * injected broadcaster, decoupled from any specific transport so it's
 * testable without a real Socket.IO server; presenceChannel.ts wires a
 * real /presence namespace's emit as the broadcaster in production.
 */
/** How long a matchID is remembered as "ended" after markMatchEnded, per PresenceManager.markMatchEnded's doc comment. */
const ENDED_MATCH_MEMORY_MS = 30_000;

export class PresenceManager {
  private readonly store = new PresenceStore();
  private readonly timers: GracePeriodTimers;
  private readonly endedMatches = new Set<string>();

  constructor(
    private readonly broadcast: PresenceBroadcaster,
    gracePeriodMs: number = DEFAULT_GRACE_PERIOD_MS,
  ) {
    this.timers = new GracePeriodTimers(gracePeriodMs);
  }

  getStatus(matchID: string, playerID: string) {
    return this.store.getStatus(matchID, playerID);
  }

  /**
   * Call once a match ends normally (RoomService.endMatch), before the
   * client's seat sockets disconnect as a side effect of tearing down. A
   * seat's presence socket and its boardgame.io Client() are unmounted the
   * same way whether the match just ended or the tab actually dropped, so
   * the /presence namespace's disconnect handler can't tell those apart on
   * its own -- this makes ending a match tell it in advance, so the
   * disconnect that's about to arrive for this matchID is ignored instead
   * of being mistaken for a real drop and restarting the grace-period
   * timer. Remembered only briefly: long enough for that expected
   * disconnect to arrive, not indefinitely (matchIDs are never reused, but
   * there's no other point at which to garbage-collect this set).
   */
  markMatchEnded(matchID: string): void {
    this.endedMatches.add(matchID);
    const timer = setTimeout(() => this.endedMatches.delete(matchID), ENDED_MATCH_MEMORY_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }

  /** Call when a seat's socket disconnects. */
  handleDisconnect(roomID: string, matchID: string, playerID: string): void {
    if (this.endedMatches.has(matchID)) return;
    this.store.setStatus(matchID, playerID, 'grace_period');
    this.broadcast({
      type: 'seatStatusChanged',
      roomID,
      playerID,
      status: 'grace_period',
    });
    this.timers.start(matchID, playerID, () => {
      this.store.setStatus(matchID, playerID, 'released');
      this.broadcast({
        type: 'seatStatusChanged',
        roomID,
        playerID,
        status: 'released',
      });
    });
  }

  /** Call when a seat reconnects with valid credentials before its grace period expires. */
  handleReconnect(roomID: string, matchID: string, playerID: string): void {
    this.timers.cancel(matchID, playerID);
    this.store.setStatus(matchID, playerID, 'connected');
    this.broadcast({
      type: 'seatStatusChanged',
      roomID,
      playerID,
      status: 'connected',
    });
  }

  /**
   * Call when the host explicitly frees a release-eligible seat
   * (seatService.releaseSeat), or when a match ends while a seat still has
   * a stale grace_period/released status from earlier in that match.
   * Broadcasts the reset to 'connected' (the store's own default for an
   * absent entry, per PresenceStore.getStatus) because usePresence on the
   * client is purely event-driven -- it never re-fetches status, so a
   * badge already showing "reconnecting" would otherwise stay stuck until
   * some unrelated event happened to overwrite it.
   */
  clearSeat(roomID: string, matchID: string, playerID: string): void {
    this.timers.cancel(matchID, playerID);
    this.store.clear(matchID, playerID);
    this.broadcast({
      type: 'seatStatusChanged',
      roomID,
      playerID,
      status: 'connected',
    });
  }
}

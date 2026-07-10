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
export class PresenceManager {
  private readonly store = new PresenceStore();
  private readonly timers: GracePeriodTimers;

  constructor(
    private readonly broadcast: PresenceBroadcaster,
    gracePeriodMs: number = DEFAULT_GRACE_PERIOD_MS,
  ) {
    this.timers = new GracePeriodTimers(gracePeriodMs);
  }

  getStatus(matchID: string, playerID: string) {
    return this.store.getStatus(matchID, playerID);
  }

  /** Call when a seat's socket disconnects. */
  handleDisconnect(roomID: string, matchID: string, playerID: string): void {
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

  /** Call when the host explicitly frees a release-eligible seat (seatService.releaseSeat). */
  clearSeat(matchID: string, playerID: string): void {
    this.timers.cancel(matchID, playerID);
    this.store.clear(matchID, playerID);
  }
}

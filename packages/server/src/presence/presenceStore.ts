import type { SeatPresenceStatus } from '@tableverse/shared';

function seatKey(matchID: string, playerID: string): string {
  return `${matchID}:${playerID}`;
}

/** In-process per-seat presence state. Single-server-instance design for the MVP — see plan.md's resolved decisions. */
export class PresenceStore {
  private readonly status = new Map<string, SeatPresenceStatus>();

  getStatus(matchID: string, playerID: string): SeatPresenceStatus {
    return this.status.get(seatKey(matchID, playerID)) ?? 'connected';
  }

  setStatus(matchID: string, playerID: string, status: SeatPresenceStatus): void {
    this.status.set(seatKey(matchID, playerID), status);
  }

  clear(matchID: string, playerID: string): void {
    this.status.delete(seatKey(matchID, playerID));
  }
}

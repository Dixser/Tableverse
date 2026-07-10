function seatKey(matchID: string, playerID: string): string {
  return `${matchID}:${playerID}`;
}

export const DEFAULT_GRACE_PERIOD_MS = 75_000;

/**
 * In-process grace-period timers, keyed per seat (matchID:playerID). Not
 * persisted — a server restart is treated as "all in-flight grace periods
 * lost," an accepted single-server-instance constraint for the MVP (see
 * plan.md's resolved decisions; a shared store like Redis is the
 * documented future migration for horizontal scaling).
 */
export class GracePeriodTimers {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly gracePeriodMs = DEFAULT_GRACE_PERIOD_MS) {}

  start(matchID: string, playerID: string, onExpire: () => void): void {
    this.cancel(matchID, playerID);
    const key = seatKey(matchID, playerID);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      onExpire();
    }, this.gracePeriodMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(key, timer);
  }

  cancel(matchID: string, playerID: string): void {
    const key = seatKey(matchID, playerID);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  isPending(matchID: string, playerID: string): boolean {
    return this.timers.has(seatKey(matchID, playerID));
  }
}

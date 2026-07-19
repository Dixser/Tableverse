import type { RoomRepository } from './roomRepository.js';
import type { SeatService } from './seatService.js';

export const DEFAULT_STALE_LOBBY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Stage 1: soft-close lobby rooms nobody has touched (room-level or seat-level) in staleMs. */
export async function closeStaleRooms(
  rooms: RoomRepository,
  staleMs = DEFAULT_STALE_LOBBY_MS,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs);
  const stale = await rooms.findStaleLobbyRooms(cutoff);
  const closedAt = new Date().toISOString();
  for (const room of stale) {
    await rooms.update(room.roomID, { closedAt });
  }
  return stale.map((room) => room.roomID);
}

/**
 * Stage 2: permanently delete rooms that have been closed for purgeAfterMs.
 * Only ever reaches rooms that stage 1 already closed, which -- per the
 * lobby-only invariant closeStaleRooms relies on -- are always `lobby`
 * status with no currentMatchID, so there's no match storage to wipe here.
 */
export async function purgeClosedRooms(
  rooms: RoomRepository,
  seats: SeatService,
  purgeAfterMs = DEFAULT_PURGE_AFTER_MS,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - purgeAfterMs);
  const toPurge = await rooms.findRoomsClosedBefore(cutoff);
  for (const room of toPurge) {
    await seats.clearAllSeats(room.roomID);
    await rooms.delete(room.roomID);
  }
  return toPurge.map((room) => room.roomID);
}

export async function runRoomCleanupSweep(
  rooms: RoomRepository,
  seats: SeatService,
  opts?: { staleMs?: number; purgeAfterMs?: number },
): Promise<{ closed: string[]; purged: string[] }> {
  const closed = await closeStaleRooms(rooms, opts?.staleMs);
  const purged = await purgeClosedRooms(rooms, seats, opts?.purgeAfterMs);
  return { closed, purged };
}

/** Starts the recurring sweep; unref'd so it never keeps the process alive on its own (mirrors GracePeriodTimers). */
export function startRoomCleanupJob(
  rooms: RoomRepository,
  seats: SeatService,
  opts?: { intervalMs?: number; staleMs?: number; purgeAfterMs?: number },
): NodeJS.Timeout {
  const intervalMs = opts?.intervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
  const timer = setInterval(() => {
    runRoomCleanupSweep(rooms, seats, opts)
      .then(({ closed, purged }) => {
        if (closed.length > 0 || purged.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `Room cleanup: closed ${closed.length}, purged ${purged.length}`,
          );
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Room cleanup sweep failed:', err);
      });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

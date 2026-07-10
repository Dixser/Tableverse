import {
  SEAT_CREDENTIAL_STORAGE_KEY,
  type SeatCredential,
  type SeatCredentialStore,
} from '@tableverse/shared';

function readAll(): SeatCredentialStore {
  const raw = localStorage.getItem(SEAT_CREDENTIAL_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SeatCredentialStore) : [];
  } catch {
    return [];
  }
}

function writeAll(store: SeatCredentialStore): void {
  localStorage.setItem(SEAT_CREDENTIAL_STORAGE_KEY, JSON.stringify(store));
}

/**
 * localStorage-backed (NOT cookies, per tech-stack.md — must survive tab
 * close) store of every seat this browser currently holds credentials for,
 * across all matches. Used both for a fresh multi-seat claim and for
 * reconnection on load — they're the same underlying data, just written
 * at different moments.
 */
export const seatCredentialStore = {
  add(credential: SeatCredential): void {
    const all = readAll().filter(
      (c) =>
        !(c.matchID === credential.matchID && c.playerID === credential.playerID),
    );
    all.push(credential);
    writeAll(all);
  },

  remove(matchID: string, playerID: string): void {
    writeAll(
      readAll().filter(
        (c) => !(c.matchID === matchID && c.playerID === playerID),
      ),
    );
  },

  getForMatch(matchID: string): SeatCredential[] {
    return readAll().filter((c) => c.matchID === matchID);
  },

  getAll(): SeatCredentialStore {
    return readAll();
  },
};

import { useCallback, useEffect, useState } from 'react';
import { canPerform, type Room, type SeatAssignment, type User } from '@tableverse/shared';
import { gamesCatalog } from '@tableverse/game-core';
import { roomApi } from '../api/roomApi.js';
import { usePresence } from '../presence/usePresence.js';
import { seatCredentialStore } from '../seats/seatCredentialStore.js';
import { PresenceBadge } from './PresenceBadge.js';

export interface RoomShellProps {
  user: User;
  sessionToken: string;
  roomID: string;
  /** Rendered inside the chrome's play area (GameMount), owned entirely by the caller. */
  children?: React.ReactNode;
  /**
   * Called with the freshly-fetched Room every time RoomShell refreshes its
   * own state (initial load, and after any action it performs). The
   * caller (ActiveRoom, in App.tsx) needs selectedGameID/currentMatchID to
   * drive GameMount/useSeatClients, which live outside RoomShell's own
   * chrome -- RoomShell owns fetching the room, but not the game-mounting
   * seam, per the chrome/board split.
   */
  onRoomUpdate?: (room: Room) => void;
}

/**
 * Platform chrome, per tech-stack.md's chrome/board split: player list,
 * seat manager, presence badges, game selector, generic settings form.
 * Never renders game-specific UI itself -- that's `children` (GameMount).
 */
export function RoomShell({
  user,
  sessionToken,
  roomID,
  children,
  onRoomUpdate,
}: RoomShellProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await roomApi.getRoom(sessionToken, roomID);
      setRoom(result.room);
      setSeats(result.seats);
      onRoomUpdate?.(result.room);
      // Picks up credentials for any of this user's seats minted since the
      // last refresh (e.g. a lobby-claimed seat's credential, issued only
      // once startMatch runs) -- see roomService.getMyCredentials's doc
      // comment for why this pull-on-fetch approach exists instead of a
      // push channel.
      for (const credential of result.myCredentials) {
        seatCredentialStore.add(credential);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [sessionToken, roomID, onRoomUpdate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const presence = usePresence(roomID);

  const role = room?.members.find((m) => m.userID === user.id)?.role;

  const claimSeat = useCallback(
    async (playerID: string) => {
      const { credential } = await roomApi.claimSeat(sessionToken, roomID, playerID);
      // Only set for a mid-game claim (room already in_game) -- a lobby
      // claim has no matchID yet to scope credentials to, per spec.md's
      // two-phase model; useSeatClients picks up lobby-claimed seats'
      // credentials in the batch startMatch issues instead.
      if (credential) seatCredentialStore.add(credential);
      await refresh();
    },
    [sessionToken, roomID, refresh],
  );

  const releaseSeat = useCallback(
    async (playerID: string) => {
      await roomApi.releaseSeat(sessionToken, roomID, playerID);
      await refresh();
    },
    [sessionToken, roomID, refresh],
  );

  const changeGame = useCallback(
    async (gameID: string) => {
      await roomApi.changeGame(sessionToken, roomID, gameID);
      await refresh();
    },
    [sessionToken, roomID, refresh],
  );

  const startMatch = useCallback(async () => {
    await roomApi.startMatch(sessionToken, roomID);
    await refresh();
  }, [sessionToken, roomID, refresh]);

  const endMatch = useCallback(async () => {
    await roomApi.endMatch(sessionToken, roomID);
    await refresh();
  }, [sessionToken, roomID, refresh]);

  if (error) return <div role="alert">{error}</div>;
  if (!room) return <div>Loading room…</div>;

  const canClaim = role != null && canPerform(role, 'claimSeat');
  const canManageSeats = role != null && canPerform(role, 'manageSeats');
  const canChangeGame = role != null && canPerform(role, 'changeGame');
  const canStart = role != null && canPerform(role, 'startMatch');
  const canEnd = role != null && canPerform(role, 'endMatch');

  return (
    <div>
      <h1>Room {room.inviteCode}</h1>

      <section aria-label="Players">
        <h2>Players</h2>
        <ul>
          {room.members.map((m) => (
            <li key={m.userID}>
              {m.userID === user.id ? 'You' : m.userID} — {m.role}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Seats">
        <h2>Seats</h2>
        <ul>
          {seats.map((seat) => (
            <li key={seat.playerID}>
              Seat {seat.playerID}: {seat.userID === user.id ? 'You' : seat.userID}{' '}
              <PresenceBadge status={presence[seat.playerID] ?? 'connected'} />
              {canManageSeats && room.status === 'in_game' && (
                <button type="button" onClick={() => releaseSeat(seat.playerID)}>
                  Release
                </button>
              )}
            </li>
          ))}
        </ul>
        {canClaim && room.status === 'lobby' && (
          <ClaimSeatForm onClaim={claimSeat} />
        )}
      </section>

      {room.status === 'lobby' && canChangeGame && (
        <section aria-label="Game selection">
          <h2>Game</h2>
          <select
            value={room.selectedGameID ?? ''}
            onChange={(e) => void changeGame(e.target.value)}
          >
            <option value="" disabled>
              Select a game…
            </option>
            {gamesCatalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          {gamesCatalog.length === 0 && <p>No games available yet.</p>}
        </section>
      )}

      {room.status === 'lobby' && canStart && room.selectedGameID && (
        <button type="button" onClick={() => void startMatch()}>
          Start match
        </button>
      )}
      {room.status === 'in_game' && canEnd && (
        <button type="button" onClick={() => void endMatch()}>
          End match
        </button>
      )}

      <div>{children}</div>
    </div>
  );
}

function ClaimSeatForm({ onClaim }: { onClaim: (playerID: string) => void }) {
  const [playerID, setPlayerID] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (playerID) onClaim(playerID);
        setPlayerID('');
      }}
    >
      <label>
        Seat number
        <input
          value={playerID}
          onChange={(e) => setPlayerID(e.target.value)}
          placeholder="0"
        />
      </label>
      <button type="submit">Claim seat</button>
    </form>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  canPerform,
  type Room,
  type SeatAssignment,
  type SeatCredential,
  type User,
} from '@tableverse/shared';
import { gamesCatalog, getEffectiveMaxPlayers, getGameModule } from '@tableverse/game-core';
import { roomApi } from '../api/roomApi.js';
import { usePresence } from '../presence/usePresence.js';
import { seatCredentialStore } from '../seats/seatCredentialStore.js';
import { ChatPanel } from '../chat/ChatPanel.js';
import { PresenceBadge } from './PresenceBadge.js';
import { SettingsForm } from './SettingsForm.js';
import styles from './RoomShell.module.css';

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
  /**
   * Called with a freshly-claimed seat's credential (mid-match claims
   * only -- a lobby claim has no credential yet, per feature 001's
   * two-phase model). Lets the caller hot-mount a Client() for it
   * immediately, closing a gap feature 001's plan.md flagged and left
   * unfixed: useSeatClients previously had no way to learn about a seat
   * claimed after its mount effect already ran (see feature 005's plan.md).
   */
  onSeatClaimed?: (credential: SeatCredential) => void;
  /**
   * Called once this user's own leaveRoom action succeeds. RoomShell
   * itself has no navigation concept (chrome/board split -- it only owns
   * fetching *this* room) -- the caller (ActiveRoom in App.tsx) resets its
   * roomID state and the URL back to home, the same way entering a room
   * sets them on the way in.
   */
  onLeftRoom?: () => void;
  /** Raw G.log if present on the active match's G -- unknown, not
   * GameLogEntry[], since a non-conforming game's G shouldn't crash the
   * panel (same defensive posture as GameoverBanner's `gameover: unknown`). */
  gameLog?: unknown;
  /**
   * Rendered alongside the Start/End match button, grouped into the same
   * row as the Players and Seats sections -- ActiveRoom passes
   * `<SeatSwitcher />` here instead of bundling it into `children`, so this
   * chrome-owned row can lay it out next to the match controls it's
   * conceptually part of (which seat's board you're viewing), rather than
   * stacked above the board itself.
   */
  seatSwitcher?: React.ReactNode;
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
  onSeatClaimed,
  onLeftRoom,
  gameLog,
  seatSwitcher,
}: RoomShellProps) {
  const { t } = useTranslation();
  const [room, setRoom] = useState<Room | null>(null);
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` (load failures, which replace the whole chrome)
  // -- a failed room action (claim/release/settings) should surface
  // without wiping out the room the user is already looking at.
  const [actionError, setActionError] = useState<string | null>(null);

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
      setActionError(null);
      try {
        const { credential } = await roomApi.claimSeat(sessionToken, roomID, playerID);
        // Only set for a mid-game claim (room already in_game) -- a lobby
        // claim has no matchID yet to scope credentials to, per spec.md's
        // two-phase model; useSeatClients picks up lobby-claimed seats'
        // credentials in the batch startMatch issues instead.
        if (credential) {
          seatCredentialStore.add(credential);
          onSeatClaimed?.(credential);
        }
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh, onSeatClaimed],
  );

  const leaveSeat = useCallback(
    async (playerID: string) => {
      setActionError(null);
      try {
        await roomApi.leaveSeat(sessionToken, roomID, playerID);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  const releaseSeat = useCallback(
    async (playerID: string) => {
      setActionError(null);
      try {
        await roomApi.releaseSeat(sessionToken, roomID, playerID);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  const changeGame = useCallback(
    async (gameID: string) => {
      setActionError(null);
      try {
        await roomApi.changeGame(sessionToken, roomID, gameID);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  const startMatch = useCallback(async () => {
    setActionError(null);
    try {
      await roomApi.startMatch(sessionToken, roomID);
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }, [sessionToken, roomID, refresh]);

  const endMatch = useCallback(async () => {
    setActionError(null);
    try {
      await roomApi.endMatch(sessionToken, roomID);
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }, [sessionToken, roomID, refresh]);

  const leaveRoom = useCallback(async () => {
    setActionError(null);
    try {
      await roomApi.leaveRoom(sessionToken, roomID);
      onLeftRoom?.();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }, [sessionToken, roomID, onLeftRoom]);

  const kickPlayer = useCallback(
    async (targetUserID: string) => {
      setActionError(null);
      try {
        await roomApi.kickPlayer(sessionToken, roomID, targetUserID);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  const setAllowMultiSeat = useCallback(
    async (allowMultiSeat: boolean) => {
      setActionError(null);
      try {
        await roomApi.setAllowMultiSeat(sessionToken, roomID, allowMultiSeat);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  const updateGameSettings = useCallback(
    async (next: Record<string, unknown>) => {
      setActionError(null);
      try {
        await roomApi.setGameSettings(sessionToken, roomID, next);
        await refresh();
      } catch (err) {
        setActionError((err as Error).message);
      }
    },
    [sessionToken, roomID, refresh],
  );

  if (error) return (
    <div className={styles.errorStatus} role="alert">
      {error}
    </div>
  );
  if (!room) return <div className={styles.status}>{t('room.loadingRoom')}</div>;

  const canClaim = role != null && canPerform(role, 'claimSeat');
  const canManageSeats = role != null && canPerform(role, 'manageSeats');
  const canChangeGame = role != null && canPerform(role, 'changeGame');
  const canStart = role != null && canPerform(role, 'startMatch');
  const canEnd = role != null && canPerform(role, 'endMatch');
  const canEditSettings = role != null && canPerform(role, 'editRoomSettings');
  const canLeaveSeat = role != null && canPerform(role, 'leaveSeat');
  const canLeaveRoom = role != null && canPerform(role, 'leaveRoom');
  const canKick = role != null && canPerform(role, 'kickPlayer');
  const selectedModule = room.selectedGameID ? getGameModule(room.selectedGameID) : undefined;

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>{t('room.title', { inviteCode: room.inviteCode })}</h1>

      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      {room.status === 'lobby' && canChangeGame && (
        <section className={styles.section} aria-label={t('room.game')}>
          <h2 className={styles.sectionTitle}>{t('room.game')}</h2>
          <select
            className={styles.select}
            value={room.selectedGameID ?? ''}
            onChange={(e) => void changeGame(e.target.value)}
          >
            <option value="" disabled>
              {t('room.selectGamePlaceholder')}
            </option>
            {gamesCatalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          {gamesCatalog.length === 0 && (
            <p className={styles.hint}>{t('room.noGamesAvailable')}</p>
          )}
          {canEditSettings && selectedModule?.settingsSchema && (
            <SettingsForm
              schema={selectedModule.settingsSchema}
              value={room.gameSettings}
              onSubmit={(next) => void updateGameSettings(next)}
            />
          )}
        </section>
      )}

      <div className={styles.topRow}>
        <section className={styles.section} aria-label={t('room.players')}>
        <h2 className={styles.sectionTitle}>{t('room.players')}</h2>
        <ul className={styles.list}>
          {room.members.map((m) => (
            <li className={styles.listItem} key={m.userID}>
              {m.userID === user.id ? t('room.you') : m.userID} —{' '}
              {t(`room.role.${m.role}`)}
              <span className={styles.spacer} />
              {m.userID === user.id && canLeaveRoom && (
                <button
                  className={styles.buttonDanger}
                  type="button"
                  onClick={() => void leaveRoom()}
                >
                  {t('room.leaveRoom')}
                </button>
              )}
              {canKick && m.userID !== user.id && (
                <button
                  className={styles.buttonDanger}
                  type="button"
                  onClick={() => void kickPlayer(m.userID)}
                >
                  {t('room.kick')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-label={t('room.seats')}>
        <h2 className={styles.sectionTitle}>{t('room.seats')}</h2>
        <ul className={styles.list}>
          {seats.map((seat) => (
            <li className={styles.listItem} key={seat.playerID}>
              {t('room.seatOccupied', {
                // Seats are 0-indexed internally (boardgame.io's playerID
                // convention), but displayed 1-indexed -- "Seat 1" for
                // playerID '0' -- so non-technical players don't see a
                // seat numbering that starts at 0.
                seatNumber: Number(seat.playerID) + 1,
                occupant: seat.userID === user.id ? t('room.you') : seat.userID,
              })}
              <PresenceBadge status={presence[seat.playerID] ?? 'connected'} />
              <span className={styles.spacer} />
              {seat.userID === user.id && canLeaveSeat && (
                <button
                  className={styles.buttonDanger}
                  type="button"
                  onClick={() => void leaveSeat(seat.playerID)}
                >
                  {t('room.leaveSeat')}
                </button>
              )}
              {canManageSeats && room.status === 'in_game' && (
                <button
                  className={styles.buttonDanger}
                  type="button"
                  onClick={() => releaseSeat(seat.playerID)}
                >
                  {t('room.release')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEditSettings && room.status === 'lobby' && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={room.allowMultiSeat}
              onChange={(e) => void setAllowMultiSeat(e.target.checked)}
            />
            {t('room.allowMultiSeat')}
          </label>
        )}
        {canClaim && room.status === 'lobby' && selectedModule && (
          <SeatPicker
            maxPlayers={getEffectiveMaxPlayers(selectedModule, room.gameSettings)}
            seats={seats}
            currentUserID={user.id}
            onClaim={claimSeat}
          />
        )}
      </section>

      <div className={styles.matchControls}>
        {room.status === 'lobby' && canStart && room.selectedGameID && (
          <button className={styles.buttonStart} type="button" onClick={() => void startMatch()}>
            {t('room.startMatch')}
          </button>
        )}
        {room.status === 'in_game' && canEnd && (
          <button className={styles.buttonDanger} type="button" onClick={() => void endMatch()}>
            {t('room.endMatch')}
          </button>
        )}
        {seatSwitcher}
        </div>
      </div>

      <div className={styles.boardArea}>{children}</div>

      <ChatPanel roomID={roomID} sessionToken={sessionToken} gameLog={gameLog} />
    </div>
  );
}

/**
 * Replaces the old free-text "seat number" input (feature 008): one
 * button per seat the selected game actually has, so a member sees
 * exactly how many seats exist and which are open at a glance. Clicking
 * an open seat's button claims it directly via the unchanged claimSeat
 * action.
 */
function SeatPicker({
  maxPlayers,
  seats,
  currentUserID,
  onClaim,
}: {
  maxPlayers: number;
  seats: SeatAssignment[];
  currentUserID: string;
  onClaim: (playerID: string) => void;
}) {
  const { t } = useTranslation();
  const seatByPlayerID = new Map(seats.map((s) => [s.playerID, s]));
  return (
    <div className={styles.seatPicker}>
      {Array.from({ length: maxPlayers }, (_, i) => String(i)).map((playerID) => {
        const occupant = seatByPlayerID.get(playerID);
        return (
          <button
            key={playerID}
            className={occupant ? styles.seatButtonTaken : styles.seatButtonOpen}
            type="button"
            disabled={!!occupant}
            onClick={() => onClaim(playerID)}
          >
            {t('room.seatLabel', { seatNumber: Number(playerID) + 1 })}
            {occupant &&
              ` — ${occupant.userID === currentUserID ? t('room.you') : occupant.userID}`}
          </button>
        );
      })}
    </div>
  );
}

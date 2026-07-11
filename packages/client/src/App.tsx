import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game } from 'boardgame.io';
import type { Room, User } from '@tableverse/shared';
import { getGameModule, withGameName } from '@tableverse/game-core';
import { useSession } from './identity/useSession.js';
import { roomApi } from './api/roomApi.js';
import { RoomShell } from './room/RoomShell.js';
import { SeatSwitcher } from './room/SeatSwitcher.js';
import { GameMount } from './gameMount/GameMount.js';
import { useSeatClients } from './seats/useSeatClients.js';
import { getInviteCodeFromLocation, setHomeUrl, setRoomUrl } from './routing.js';
import { ThemeToggle } from './theme/ThemeToggle.js';
import styles from './App.module.css';

const FALLBACK_GAME: Game = {};

function IdentityGate({
  onIdentify,
  loading,
  error,
}: {
  onIdentify: (displayName: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [displayName, setDisplayName] = useState('');
  return (
    <div className={styles.page}>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          if (displayName.trim()) onIdentify(displayName.trim());
        }}
      >
        <h1 className={styles.title}>Tableverse</h1>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nickname</span>
          <input
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <button className={styles.button} type="submit" disabled={loading}>
          Continue
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function RoomEntry({
  user,
  sessionToken,
  initialInviteCode,
  initialError,
  onEnter,
}: {
  user: User;
  sessionToken: string;
  /** Prefilled from a /room/:inviteCode link, e.g. after an auto-join attempt failed. */
  initialInviteCode?: string;
  /** Set alongside initialInviteCode when an auto-join attempt (from a /room/:inviteCode link) failed. */
  initialError?: string;
  onEnter: (room: Room) => void;
}) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '');
  const [error, setError] = useState<string | null>(initialError ?? null);

  const createRoom = async () => {
    try {
      const { room } = await roomApi.createRoom(sessionToken);
      onEnter(room);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const joinRoom = async () => {
    try {
      const { room } = await roomApi.joinRoom(sessionToken, inviteCode);
      onEnter(room);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.welcome}>Welcome, {user.displayName}.</p>
        <button className={styles.button} type="button" onClick={() => void createRoom()}>
          Create a room
        </button>
        <hr className={styles.divider} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void joinRoom();
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Invite code</span>
            <input
              className={styles.input}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </label>
          <button className={styles.buttonSecondary} type="submit">
            Join
          </button>
        </form>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ActiveRoom({
  roomID,
  user,
  sessionToken,
  onLeftRoom,
}: {
  roomID: string;
  user: User;
  sessionToken: string;
  onLeftRoom: () => void;
}) {
  // Populated from RoomShell's own room fetches -- RoomShell owns fetching
  // the Room (chrome/board split), but GameMount/useSeatClients live
  // outside its chrome, so they need the current selectedGameID/
  // currentMatchID surfaced back up via onRoomUpdate.
  const [matchID, setMatchID] = useState<string | null>(null);
  const [selectedGameID, setSelectedGameID] = useState<string | null>(null);
  const handleRoomUpdate = useCallback((room: Room) => {
    setSelectedGameID(room.selectedGameID);
    setMatchID(room.currentMatchID);
    setRoomUrl(room.inviteCode);
  }, []);
  const module = selectedGameID ? getGameModule(selectedGameID) : undefined;
  // `.name` must match the catalog id, or boardgame.io's client transport
  // connects to the wrong Socket.IO namespace and silently never syncs
  // (see withGameName's doc comment) -- the server applies the same
  // transform when building its own games list.
  // Memoized: withGameName returns a new object every call, and
  // useSeatClients's effect depends on this value referentially -- without
  // memoizing, the effect would tear down and recreate the Client() (and
  // its socket) on every render, never giving it a chance to sync.
  const gameDef = useMemo(
    () => (module ? withGameName(module) : FALLBACK_GAME),
    [module],
  );
  const seatClients = useSeatClients(roomID, matchID, gameDef);

  return (
    <RoomShell
      user={user}
      sessionToken={sessionToken}
      roomID={roomID}
      onRoomUpdate={handleRoomUpdate}
      onSeatClaimed={(credential) => seatClients.addSeat(roomID, credential)}
      onLeftRoom={onLeftRoom}
    >
      <SeatSwitcher
        seatIDs={seatClients.seatIDs}
        activeSeatID={seatClients.activeSeatID}
        onSelect={seatClients.setActiveSeatID}
      />
      <GameMount
        selectedGameID={selectedGameID}
        boardProps={seatClients.boardProps}
        playerNames={seatClients.playerNames}
      />
    </RoomShell>
  );
}

export function App() {
  const session = useSession();
  const [roomID, setRoomID] = useState<string | null>(null);
  // Captured once on mount from a /room/:inviteCode link. Consumed (and
  // cleared) by the auto-join effect below once a session exists; also
  // passed to RoomEntry to prefill the join form if auto-join fails (e.g.
  // stale/invalid code) so the user isn't left staring at a blank form.
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(
    () => getInviteCodeFromLocation(),
  );
  const [autoJoinError, setAutoJoinError] = useState<{
    inviteCode: string;
    message: string;
  } | null>(null);

  const enterRoom = useCallback((room: Room) => {
    setRoomID(room.roomID);
    setRoomUrl(room.inviteCode);
  }, []);

  const leaveActiveRoom = useCallback(() => {
    setRoomID(null);
    setHomeUrl();
  }, []);

  useEffect(() => {
    if (!pendingInviteCode || !session.user || !session.sessionToken || roomID) {
      return;
    }
    const code = pendingInviteCode;
    setPendingInviteCode(null);
    roomApi
      .joinRoom(session.sessionToken, code)
      .then(({ room }) => enterRoom(room))
      .catch((err: Error) => {
        setAutoJoinError({ inviteCode: code, message: err.message });
        setHomeUrl();
      });
  }, [pendingInviteCode, session.user, session.sessionToken, roomID, enterRoom]);

  function renderScreen() {
    if (session.loading) return <p className={styles.status}>Loading…</p>;
    if (!session.user || !session.sessionToken) {
      return (
        <IdentityGate
          onIdentify={(name) => void session.identify(name)}
          loading={session.loading}
          error={session.error}
        />
      );
    }
    if (pendingInviteCode) return <p className={styles.status}>Joining room…</p>;
    if (!roomID) {
      return (
        <RoomEntry
          user={session.user}
          sessionToken={session.sessionToken}
          initialInviteCode={autoJoinError?.inviteCode}
          initialError={
            autoJoinError
              ? `Couldn't join room ${autoJoinError.inviteCode}: ${autoJoinError.message}`
              : undefined
          }
          onEnter={enterRoom}
        />
      );
    }
    return (
      <ActiveRoom
        roomID={roomID}
        user={session.user}
        sessionToken={session.sessionToken}
        onLeftRoom={leaveActiveRoom}
      />
    );
  }

  // ThemeToggle rendered once, always visible regardless of which screen is
  // showing -- per plan.md's placement decision, a first-time visitor
  // should be able to fix an uncomfortable theme before picking a nickname.
  return (
    <>
      {renderScreen()}
      <ThemeToggle />
    </>
  );
}

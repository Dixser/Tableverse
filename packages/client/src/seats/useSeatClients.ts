import { useCallback, useEffect, useState } from 'react';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io, type Socket } from 'socket.io-client';
import type { FilteredMetadata, Game } from 'boardgame.io';
import type { BoardProps } from '@tableverse/game-core';
import type { SeatCredential } from '@tableverse/shared';
import { API_BASE_URL } from '../config.js';
import { seatCredentialStore } from './seatCredentialStore.js';

type ClientInstance = ReturnType<typeof Client>;
type SeatState = ReturnType<ClientInstance['getState']>;

export interface SeatClientsState {
  /** playerIDs of every seat this browser holds in this match. */
  seatIDs: string[];
  /** Which claimed seat's board is currently focused/rendered. */
  activeSeatID: string | null;
  setActiveSeatID: (playerID: string) => void;
  /**
   * Ready-to-render BoardProps for the active seat if this browser holds
   * one, else a read-only spectator's BoardProps (moves: {}, playerID:
   * null) if it doesn't -- null only while the relevant Client hasn't
   * synced its first state from the server yet, or there's no live match
   * at all. Built by subscribing to the active/spectator Client's state
   * changes -- boardgame.io's Client does not itself trigger a React
   * re-render, so without this subscription the board would render once
   * (usually before the server's initial sync arrives) and never update
   * again.
   */
  boardProps: BoardProps | null;
  /**
   * Mounts a new background Client() for a just-claimed seat and adds it
   * to the credential store -- the same code path reconnection uses on
   * load, just triggered by a fresh claim instead.
   */
  addSeat: (roomID: string, credential: SeatCredential) => void;
  /**
   * playerID -> display name, derived from the active (or spectator)
   * Client's matchData -- boardgame.io's own FilteredMetadata, already
   * populated server-side from User.displayName at seat-claim/match-start
   * time (see roomService.claimSeat/startMatch). Entries with no `name`
   * yet synced are simply absent -- callers (GameoverBanner) fall back to
   * a seat-number label for any playerID missing here, so this map is
   * allowed to be partial or momentarily empty (e.g. right after a fresh
   * Client() mount, before its first sync arrives).
   */
  playerNames: Record<string, string>;
}

interface MountedSeat {
  client: ClientInstance;
  /** Separate socket identifying this seat on the /presence channel, so a disconnect here (not the game-state socket) drives the grace-period timer -- per tech-stack.md's presence design being independent of boardgame.io's own channel. */
  presenceSocket: Socket;
  unsubscribe: () => void;
}

/**
 * A spectator has no seat and therefore nothing for the presence/
 * grace-period system to track -- unlike MountedSeat, no presence socket
 * is opened. The room-level presence badges members see are driven by
 * RoomShell's own usePresence(roomID), a separate observer-only join.
 */
interface MountedSpectator {
  client: ClientInstance;
  unsubscribe: () => void;
}

function mountSeat(
  gameDef: Game,
  roomID: string,
  credential: SeatCredential,
  onState: (state: SeatState) => void,
): MountedSeat {
  const client = Client({
    game: gameDef,
    multiplayer: SocketIO({ server: API_BASE_URL }),
    matchID: credential.matchID,
    playerID: credential.playerID,
    credentials: credential.credentials,
  });
  const unsubscribe = client.subscribe(onState);
  client.start();

  const presenceSocket = io(`${API_BASE_URL}/presence`, {
    path: '/presence-socket',
  });
  presenceSocket.on('connect', () => {
    presenceSocket.emit('hello', {
      roomID,
      seat: { matchID: credential.matchID, playerID: credential.playerID },
    });
  });

  return { client, presenceSocket, unsubscribe };
}

function unmountSeat(seat: MountedSeat): void {
  seat.unsubscribe();
  seat.client.stop();
  seat.presenceSocket.disconnect();
}

/**
 * Mounts a read-only spectator Client() -- no playerID, no credentials.
 * This is exactly what makes boardgame.io's own multiplayer transport
 * treat the connection as a spectator and scope playerView accordingly
 * (spec.md story 2); no new enforcement layer is added here.
 */
function mountSpectator(
  gameDef: Game,
  matchID: string,
  onState: (state: SeatState) => void,
): MountedSpectator {
  const client = Client({
    game: gameDef,
    multiplayer: SocketIO({ server: API_BASE_URL }),
    matchID,
  });
  const unsubscribe = client.subscribe(onState);
  client.start();
  return { client, unsubscribe };
}

function unmountSpectator(spectator: MountedSpectator): void {
  spectator.unsubscribe();
  spectator.client.stop();
}

/**
 * Extracts playerID -> display name from boardgame.io's own FilteredMetadata
 * (`{ id: number; name?: string; ... }[]`). Deliberately NOT sourced from
 * SeatState/getState() -- matchData arrives over a separate 'matchData'
 * socket event and is stored directly on the Client instance itself
 * (`client.matchData`), not folded into the state object passed to
 * subscribers (confirmed against boardgame.io's own client implementation;
 * its official React Board wrapper reads it the same way,
 * `this.client.matchData`). Receiving it still calls notifySubscribers(),
 * so the owning hook's onState callback fires and triggers a re-render --
 * by the time that happens, `client.matchData` is already current.
 * Entries with no name yet synced are omitted, not defaulted -- the
 * fallback label is a display concern owned by the caller (GameoverBanner),
 * not this hook.
 */
function playerNamesFrom(matchData: FilteredMetadata | undefined): Record<string, string> {
  const names: Record<string, string> = {};
  for (const entry of matchData ?? []) {
    if (entry.name) names[String(entry.id)] = entry.name;
  }
  return names;
}

/**
 * Mounts one boardgame.io Client() per seat this browser holds credentials
 * for in the given match -- one per claimed playerID, per tech-stack.md's
 * multi-seat design. All non-active clients keep running in the
 * background (not unmounted) so their state stays live; only the active
 * seat's state feeds `boardProps` (enforced here, not by the caller) --
 * hidden-information games must never have two claimed seats' state
 * rendered simultaneously.
 */
export function useSeatClients(
  roomID: string | null,
  matchID: string | null,
  gameDef: Game,
): SeatClientsState {
  const [seats, setSeats] = useState<Map<string, MountedSeat>>(new Map());
  const [activeSeatID, setActiveSeatIDState] = useState<string | null>(null);
  const [statesBySeat, setStatesBySeat] = useState<Map<string, SeatState>>(
    new Map(),
  );
  const [spectator, setSpectator] = useState<MountedSpectator | null>(null);
  const [spectatorState, setSpectatorState] = useState<SeatState | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!roomID || !matchID) {
      setSeats(new Map());
      setActiveSeatIDState(null);
      setStatesBySeat(new Map());
      setSpectator(null);
      setSpectatorState(undefined);
      return;
    }
    const credentials = seatCredentialStore.getForMatch(matchID);

    // AC3: claimed seats always take priority -- a spectator Client() is
    // only ever mounted when this browser holds zero seats in this match.
    if (credentials.length === 0) {
      const spectatorClient = mountSpectator(gameDef, matchID, setSpectatorState);
      setSeats(new Map());
      setStatesBySeat(new Map());
      setActiveSeatIDState(null);
      setSpectator(spectatorClient);
      return () => unmountSpectator(spectatorClient);
    }

    const mounted = new Map<string, MountedSeat>();
    for (const credential of credentials) {
      const playerID = credential.playerID;
      mounted.set(
        playerID,
        mountSeat(gameDef, roomID, credential, (state) => {
          setStatesBySeat((prev) => {
            const next = new Map(prev);
            next.set(playerID, state);
            return next;
          });
        }),
      );
    }
    setSeats(mounted);
    setStatesBySeat(new Map());
    setActiveSeatIDState(credentials[0]?.playerID ?? null);
    setSpectator(null);
    setSpectatorState(undefined);

    return () => {
      for (const seat of mounted.values()) unmountSeat(seat);
    };
  }, [roomID, matchID, gameDef]);

  const setActiveSeatID = useCallback(
    (playerID: string) => {
      if (seats.has(playerID)) setActiveSeatIDState(playerID);
    },
    [seats],
  );

  const addSeat = useCallback(
    (targetRoomID: string, credential: SeatCredential) => {
      seatCredentialStore.add(credential);
      const playerID = credential.playerID;
      const seat = mountSeat(gameDef, targetRoomID, credential, (state) => {
        setStatesBySeat((prev) => {
          const next = new Map(prev);
          next.set(playerID, state);
          return next;
        });
      });
      setSeats((prev) => {
        const next = new Map(prev);
        const existing = next.get(playerID);
        if (existing) unmountSeat(existing);
        next.set(playerID, seat);
        return next;
      });
      setActiveSeatIDState(playerID);
      // A newly claimed seat supersedes the spectator view entirely -- a
      // browser can't simultaneously be spectating and holding the seat
      // it just claimed.
      setSpectator((prev) => {
        if (prev) unmountSpectator(prev);
        return null;
      });
    },
    [gameDef],
  );

  const activeClient = activeSeatID ? seats.get(activeSeatID)?.client : undefined;
  const activeState = activeSeatID ? statesBySeat.get(activeSeatID) : undefined;
  const boardProps: BoardProps | null =
    activeClient && activeState
      ? {
          G: activeState.G,
          ctx: activeState.ctx,
          moves: activeClient.moves,
          playerID: activeClient.playerID,
          isActive: activeState.isActive,
        }
      : spectator && spectatorState
        ? {
            G: spectatorState.G,
            ctx: spectatorState.ctx,
            // A spectator never receives a real moves object to call --
            // spec.md AC4 is enforced structurally here, not by hoping
            // nothing calls a move.
            moves: {},
            playerID: null,
            isActive: false,
          }
        : null;

  const playerNames = playerNamesFrom(activeClient?.matchData ?? spectator?.client.matchData);

  return {
    seatIDs: [...seats.keys()],
    activeSeatID,
    setActiveSeatID,
    boardProps,
    addSeat,
    playerNames,
  };
}

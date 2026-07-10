import { useCallback, useEffect, useState } from 'react';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io, type Socket } from 'socket.io-client';
import type { Game } from 'boardgame.io';
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
   * Ready-to-render BoardProps for the active seat, or null if this
   * browser holds no seat (spectator) or the active seat's Client hasn't
   * synced state from the server yet. Built by subscribing to the active
   * Client's state changes -- boardgame.io's Client does not itself
   * trigger a React re-render, so without this subscription the board
   * would render once (usually before the server's initial sync arrives)
   * and never update again.
   */
  boardProps: BoardProps | null;
  /**
   * Mounts a new background Client() for a just-claimed seat and adds it
   * to the credential store -- the same code path reconnection uses on
   * load, just triggered by a fresh claim instead.
   */
  addSeat: (roomID: string, credential: SeatCredential) => void;
}

interface MountedSeat {
  client: ClientInstance;
  /** Separate socket identifying this seat on the /presence channel, so a disconnect here (not the game-state socket) drives the grace-period timer -- per tech-stack.md's presence design being independent of boardgame.io's own channel. */
  presenceSocket: Socket;
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

  useEffect(() => {
    if (!roomID || !matchID) {
      setSeats(new Map());
      setActiveSeatIDState(null);
      setStatesBySeat(new Map());
      return;
    }
    const credentials = seatCredentialStore.getForMatch(matchID);
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
      : null;

  return {
    seatIDs: [...seats.keys()],
    activeSeatID,
    setActiveSeatID,
    boardProps,
    addSeat,
  };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Game } from 'boardgame.io';
import { useSeatClients } from './useSeatClients.js';
import { seatCredentialStore } from './seatCredentialStore.js';

interface MockClientInstance {
  opts: Record<string, unknown>;
  subscribe: (cb: (state: unknown) => void) => () => void;
  start: () => void;
  stop: () => void;
  moves: Record<string, () => void>;
  playerID: string | null | undefined;
  /** Mirrors boardgame.io's own Client: a property on the instance, never
   * part of the state object passed to subscribers (see useSeatClients.ts's
   * playerNamesFrom doc comment for why). Set it directly, then call
   * push(...) to simulate the re-render notifySubscribers() triggers when
   * boardgame.io's real 'matchData' event arrives. */
  matchData?: { id: number; name?: string }[];
  push: (state: unknown) => void;
}

const { mockClientInstances, MockClient } = vi.hoisted(() => {
  const instances: MockClientInstance[] = [];
  const ClientMock = vi.fn((opts: Record<string, unknown>) => {
    let listener: ((state: unknown) => void) | null = null;
    const instance: MockClientInstance = {
      opts,
      subscribe: (cb) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
      start: vi.fn(),
      stop: vi.fn(),
      moves: { someMove: vi.fn() },
      playerID: opts.playerID as string | null | undefined,
      matchData: undefined,
      push: (state) => listener?.(state),
    };
    instances.push(instance);
    return instance;
  });
  return { mockClientInstances: instances, MockClient: ClientMock };
});

vi.mock('boardgame.io/client', () => ({ Client: MockClient }));
vi.mock('boardgame.io/multiplayer', () => ({ SocketIO: vi.fn(() => ({})) }));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

const gameDef: Game = {};

describe('useSeatClients', () => {
  afterEach(() => {
    localStorage.clear();
    mockClientInstances.length = 0;
    vi.clearAllMocks();
  });

  it('mounts a spectator Client (no playerID/credentials) when the user holds no seat in the match', () => {
    renderHook(() => useSeatClients('room-1', 'match-1', gameDef));

    expect(mockClientInstances).toHaveLength(1);
    expect(mockClientInstances[0]?.opts.playerID).toBeUndefined();
    expect(mockClientInstances[0]?.opts.credentials).toBeUndefined();
  });

  it("reflects the spectator client's successive state updates in boardProps", () => {
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    const spectatorClient = mockClientInstances[0]!;

    act(() => spectatorClient.push({ G: { cells: [1] }, ctx: {}, isActive: false }));
    expect(result.current.boardProps?.G).toEqual({ cells: [1] });

    act(() => spectatorClient.push({ G: { cells: [1, 2] }, ctx: {}, isActive: false }));
    expect(result.current.boardProps?.G).toEqual({ cells: [1, 2] });
  });

  it('never exposes real moves or a playerID for the spectator case', () => {
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    act(() => mockClientInstances[0]!.push({ G: {}, ctx: {}, isActive: false }));

    expect(result.current.boardProps?.moves).toEqual({});
    expect(result.current.boardProps?.playerID).toBeNull();
  });

  it('mounts a claimed-seat client instead of a spectator when the store already holds a credential for the match', () => {
    seatCredentialStore.add({ matchID: 'match-1', playerID: '0', credentials: 'cred-0' });

    renderHook(() => useSeatClients('room-1', 'match-1', gameDef));

    expect(mockClientInstances).toHaveLength(1);
    expect(mockClientInstances[0]?.opts.playerID).toBe('0');
    expect(mockClientInstances[0]?.opts.credentials).toBe('cred-0');
  });

  it('addSeat tears down a mounted spectator and mounts the newly claimed seat instead', () => {
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    const spectatorClient = mockClientInstances[0]!;
    expect(mockClientInstances).toHaveLength(1);

    act(() => {
      result.current.addSeat('room-1', {
        matchID: 'match-1',
        playerID: '0',
        credentials: 'cred-0',
      });
    });

    expect(spectatorClient.stop).toHaveBeenCalled();
    expect(result.current.seatIDs).toEqual(['0']);
    expect(result.current.activeSeatID).toBe('0');
  });

  it('mounts no client at all when there is no live match', () => {
    renderHook(() => useSeatClients('room-1', null, gameDef));
    expect(mockClientInstances).toHaveLength(0);
  });

  it('starts with an empty playerNames map before any matchData has arrived', () => {
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    expect(result.current.playerNames).toEqual({});
  });

  it('derives playerNames from the spectator client matchData, omitting entries with no name', () => {
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    const spectatorClient = mockClientInstances[0]!;

    act(() => {
      spectatorClient.matchData = [
        { id: 0, name: 'Alice' },
        { id: 1 },
      ];
      spectatorClient.push({ G: {}, ctx: {}, isActive: false });
    });

    expect(result.current.playerNames).toEqual({ '0': 'Alice' });
  });

  it('derives playerNames from the active seat client matchData', () => {
    seatCredentialStore.add({ matchID: 'match-1', playerID: '0', credentials: 'cred-0' });
    const { result } = renderHook(() => useSeatClients('room-1', 'match-1', gameDef));
    const seatClient = mockClientInstances[0]!;

    act(() => {
      seatClient.matchData = [
        { id: 0, name: 'Alice' },
        { id: 1, name: 'Bob' },
      ];
      seatClient.push({ G: {}, ctx: {}, isActive: true });
    });

    expect(result.current.playerNames).toEqual({ '0': 'Alice', '1': 'Bob' });
  });
});

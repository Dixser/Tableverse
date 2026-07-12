import type { Room, SeatAssignment, SeatCredential } from '@tableverse/shared';
import { API_BASE_URL } from '../config.js';
import { SESSION_TOKEN_HEADER } from '../identity/useSession.js';

export class RoomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  sessionToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      [SESSION_TOKEN_HEADER]: sessionToken,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new RoomApiError(error ?? `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Typed client for the room HTTP endpoints exposed by packages/server's roomRoutes.ts. */
export const roomApi = {
  createRoom(sessionToken: string): Promise<{ room: Room }> {
    return request('/api/rooms', sessionToken, { method: 'POST' });
  },

  joinRoom(sessionToken: string, inviteCode: string): Promise<{ room: Room }> {
    return request('/api/rooms/join', sessionToken, {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  getRoom(
    sessionToken: string,
    roomID: string,
  ): Promise<{
    room: Room;
    seats: SeatAssignment[];
    myCredentials: SeatCredential[];
  }> {
    return request(`/api/rooms/${roomID}`, sessionToken);
  },

  claimSeat(
    sessionToken: string,
    roomID: string,
    playerID: string,
  ): Promise<{ assignment: SeatAssignment; credential: SeatCredential | null }> {
    return request(`/api/rooms/${roomID}/seats/${playerID}/claim`, sessionToken, {
      method: 'POST',
    });
  },

  leaveSeat(sessionToken: string, roomID: string, playerID: string): Promise<void> {
    return request(`/api/rooms/${roomID}/seats/${playerID}/leave`, sessionToken, {
      method: 'POST',
    });
  },

  releaseSeat(sessionToken: string, roomID: string, playerID: string): Promise<void> {
    return request(`/api/rooms/${roomID}/seats/${playerID}/release`, sessionToken, {
      method: 'POST',
    });
  },

  leaveRoom(sessionToken: string, roomID: string): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/leave`, sessionToken, { method: 'POST' });
  },

  kickPlayer(
    sessionToken: string,
    roomID: string,
    targetUserID: string,
  ): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/kick`, sessionToken, {
      method: 'POST',
      body: JSON.stringify({ targetUserID }),
    });
  },

  setAllowMultiSeat(
    sessionToken: string,
    roomID: string,
    allowMultiSeat: boolean,
  ): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/settings`, sessionToken, {
      method: 'POST',
      body: JSON.stringify({ allowMultiSeat }),
    });
  },

  setGameSettings(
    sessionToken: string,
    roomID: string,
    gameSettings: Record<string, unknown>,
  ): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/settings`, sessionToken, {
      method: 'POST',
      body: JSON.stringify({ gameSettings }),
    });
  },

  changeGame(
    sessionToken: string,
    roomID: string,
    gameID: string,
  ): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/game`, sessionToken, {
      method: 'POST',
      body: JSON.stringify({ gameID }),
    });
  },

  startMatch(
    sessionToken: string,
    roomID: string,
  ): Promise<{ room: Room; credentialsByUserID: Record<string, SeatCredential[]> }> {
    return request(`/api/rooms/${roomID}/start`, sessionToken, { method: 'POST' });
  },

  endMatch(sessionToken: string, roomID: string): Promise<{ room: Room }> {
    return request(`/api/rooms/${roomID}/end`, sessionToken, { method: 'POST' });
  },
};

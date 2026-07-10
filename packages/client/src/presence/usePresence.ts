import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { SeatPresenceStatus, SeatStatusChangedEvent } from '@tableverse/shared';
import { API_BASE_URL } from '../config.js';

/**
 * Joins the room's dedicated /presence channel (separate from
 * boardgame.io's own game-state channel, per tech-stack.md) purely as an
 * observer, and returns live per-seat connection status for rendering
 * badges. Does not identify a seat of its own -- claimed-seat identity for
 * grace-period tracking is established by useSeatClients/GameMount
 * separately, wherever a Client() is actually mounted for a held seat.
 */
export function usePresence(
  roomID: string | null,
): Record<string, SeatPresenceStatus> {
  const [statusByPlayerID, setStatusByPlayerID] = useState<
    Record<string, SeatPresenceStatus>
  >({});

  useEffect(() => {
    if (!roomID) return;
    setStatusByPlayerID({});
    const socket = io(`${API_BASE_URL}/presence`, {
      path: '/presence-socket',
    });
    socket.on('connect', () => socket.emit('hello', { roomID }));
    socket.on('seatStatusChanged', (event: SeatStatusChangedEvent) => {
      if (event.roomID !== roomID) return;
      setStatusByPlayerID((prev) => ({ ...prev, [event.playerID]: event.status }));
    });
    return () => {
      socket.disconnect();
    };
  }, [roomID]);

  return statusByPlayerID;
}

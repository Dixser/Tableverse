import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config.js';

/**
 * Joins the room's dedicated /room-events channel (separate from
 * boardgame.io's own game-state channel and from /presence and /chat, per
 * tech-stack.md's "never share a channel" convention) purely to learn
 * "something about this room changed" -- the event itself carries no data.
 * Calls `onChanged` (RoomShell's own `refresh()`) whenever that happens, so
 * a browser that isn't the one performing an action still re-fetches the
 * room instead of staying stale until a manual reload -- see
 * spec/features/017-room-live-sync.
 */
export function useRoomEvents(roomID: string | null, onChanged: () => void): void {
  useEffect(() => {
    if (!roomID) return;
    const socket = io(`${API_BASE_URL}/room-events`, {
      path: '/room-events-socket',
    });
    socket.on('connect', () => socket.emit('hello', { roomID }));
    socket.on('roomChanged', onChanged);
    return () => {
      socket.disconnect();
    };
  }, [roomID, onChanged]);
}

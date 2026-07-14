import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';

interface HelloPayload {
  roomID: string;
}

/**
 * Dedicated /room-events Socket.IO namespace, structurally mirroring
 * presenceChannel.ts's createPresenceSystem -- own engine.io path
 * (/room-events-socket), joined per-roomID. Unlike presence, there is no
 * state machine here: the only thing ever sent is a content-free
 * "roomID X changed" ping. Every listening client reacts by re-running its
 * own already-correct, already-permission-filtered GET /api/rooms/:roomID
 * fetch (RoomShell's refresh()) -- see spec/features/017-room-live-sync's
 * plan.md for why this avoids needing a second, recipient-aware
 * broadcast-filtering path (the one chatChannel.ts needs, because chat
 * content legitimately differs per recipient). No auth check on `hello`,
 * matching presence's posture: the payload carries nothing sensitive, so a
 * socket joining the wrong roomID only causes itself a wasted, still
 * permission-checked re-fetch.
 */
export function createRoomEventsSystem(
  httpServer: HttpServer,
  corsOrigins: string[] = [],
): { io: SocketIOServer; roomChanged: (roomID: string) => void } {
  const io = new SocketIOServer(httpServer, {
    path: '/room-events-socket',
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : undefined,
  });
  const namespace = io.of('/room-events');

  namespace.on('connection', (socket) => {
    socket.on('hello', (payload: HelloPayload) => {
      void socket.join(payload.roomID);
    });
  });

  const roomChanged = (roomID: string): void => {
    namespace.to(roomID).emit('roomChanged');
  };

  return { io, roomChanged };
}

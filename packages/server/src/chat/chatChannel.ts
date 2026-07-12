import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { nanoid } from 'nanoid';
import { getRoleInRoom } from '../rooms/roomAccess.js';
import { ChatStore, type ChatMessage } from './chatStore.js';
import type { UserRepository } from '../identity/userRepository.js';
import type { RoomRepository } from '../rooms/roomRepository.js';
import type { SeatService } from '../rooms/seatService.js';

const MAX_BODY_LENGTH = 500;

interface ChatHelloPayload {
  roomID: string;
  sessionToken: string;
}

interface SendMessagePayload {
  roomID: string;
  body: string;
}

interface ChatIdentity {
  roomID: string;
  userID: string;
  displayName: string;
}

export interface ChatSystemDeps {
  users: UserRepository;
  rooms: RoomRepository;
  seats: SeatService;
}

/**
 * Dedicated /chat Socket.IO namespace, structurally mirroring
 * presenceChannel.ts's createPresenceSystem -- own engine.io path
 * (/chat-socket), joined per-roomID Socket.IO room. Differs from presence
 * in one important way: identity is verified against a real session
 * token, not trusted from an unauthenticated client-supplied payload --
 * chat messages carry a human-readable author identity broadcast to every
 * other member, so impersonation is a real, visible risk (see
 * spec/features/012-chat/plan.md).
 */
export function createChatSystem(
  httpServer: HttpServer,
  deps: ChatSystemDeps,
  corsOrigins: string[] = [],
): { io: SocketIOServer; chatStore: ChatStore } {
  const io = new SocketIOServer(httpServer, {
    path: '/chat-socket',
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : undefined,
  });
  const namespace = io.of('/chat');
  const chatStore = new ChatStore();
  // Keyed by socket.id -- Socket.IO's own RemoteSocket (returned by
  // fetchSockets()) carries no reference back to this handler's closure
  // state, so per-recipient identity must be tracked out-of-band to
  // recompute each connected socket's own current seated status on send
  // (plan.md's "iterate the room's connected sockets individually").
  const identityBySocketId = new Map<string, ChatIdentity>();

  async function isSeated(roomID: string, userID: string): Promise<boolean> {
    const seats = await deps.seats.getSeatsForRoom(roomID);
    return seats.some((s) => s.userID === userID);
  }

  namespace.on('connection', (socket: Socket) => {
    socket.on('hello', (payload: ChatHelloPayload) => {
      void (async () => {
        const user = await deps.users.getBySessionToken(payload.sessionToken);
        if (!user) {
          socket.disconnect(true);
          return;
        }
        const room = await deps.rooms.getById(payload.roomID);
        if (!room || getRoleInRoom(room, user.id) === undefined) {
          socket.disconnect(true);
          return;
        }

        identityBySocketId.set(socket.id, {
          roomID: payload.roomID,
          userID: user.id,
          displayName: user.displayName,
        });
        await socket.join(payload.roomID);
        const viewerIsSeated = await isSeated(payload.roomID, user.id);
        socket.emit('chatHistory', chatStore.historyFor(payload.roomID, viewerIsSeated));
      })();
    });

    socket.on('sendMessage', (payload: SendMessagePayload) => {
      void (async () => {
        const identity = identityBySocketId.get(socket.id);
        if (!identity || identity.roomID !== payload.roomID) return;
        const body = payload.body.trim().slice(0, MAX_BODY_LENGTH);
        if (!body) return;

        // Re-derived fresh, not reused from hello -- seat status may have
        // changed since this socket connected (spec.md's resolved
        // decision: frozen at SEND time, not connect time).
        const authorWasSeated = await isSeated(identity.roomID, identity.userID);
        const message: ChatMessage = {
          id: nanoid(16),
          roomID: identity.roomID,
          authorUserID: identity.userID,
          authorDisplayName: identity.displayName,
          authorWasSeated,
          body,
          sentAt: new Date().toISOString(),
        };
        chatStore.append(message);

        for (const [, roomSocket] of namespace.sockets) {
          if (!roomSocket.rooms.has(identity.roomID)) continue;
          const recipientIdentity = identityBySocketId.get(roomSocket.id);
          if (!recipientIdentity) continue;
          const recipientIsSeated = await isSeated(identity.roomID, recipientIdentity.userID);
          if (message.authorWasSeated || !recipientIsSeated) {
            roomSocket.emit('chatMessage', message);
          }
        }
      })();
    });

    socket.on('disconnect', () => {
      identityBySocketId.delete(socket.id);
    });
  });

  return { io, chatStore };
}

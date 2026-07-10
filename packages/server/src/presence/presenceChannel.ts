import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { SeatStatusChangedEvent } from '@tableverse/shared';
import { PresenceManager } from './presenceManager.js';
import { DEFAULT_GRACE_PERIOD_MS } from './presenceTimers.js';

interface HelloPayload {
  roomID: string;
  /** Present only for a socket that IS a claimed seat, not a plain observer (e.g. a spectator watching presence badges). */
  seat?: { matchID: string; playerID: string };
}

/**
 * Dedicated /presence Socket.IO namespace, separate from boardgame.io's own
 * transport, per tech-stack.md — presence updates never travel over the
 * game-state channel. Any room member (seated or not) joins by emitting
 * 'hello' with roomID right after connecting, to receive broadcasts for
 * that room; a socket that also identifies a `seat` additionally starts
 * that seat's grace-period timer on disconnect.
 */
export function createPresenceSystem(
  httpServer: HttpServer,
  gracePeriodMs: number = DEFAULT_GRACE_PERIOD_MS,
  corsOrigins: string[] = [],
): { io: SocketIOServer; presenceManager: PresenceManager } {
  // Socket.IO intercepts the HTTP handshake before Koa's middleware chain
  // runs (it's not a Koa route), so the app-level CORS middleware in
  // index.ts never applies here -- this needs its own `cors` option,
  // confirmed by the polling handshake failing with net::ERR_FAILED in a
  // real browser until this was added.
  const io = new SocketIOServer(httpServer, {
    path: '/presence-socket',
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : undefined,
  });
  const namespace = io.of('/presence');

  const broadcast = (event: SeatStatusChangedEvent): void => {
    namespace.to(event.roomID).emit('seatStatusChanged', event);
  };
  const presenceManager = new PresenceManager(broadcast, gracePeriodMs);

  namespace.on('connection', (socket) => {
    let identity: HelloPayload | undefined;

    socket.on('hello', (payload: HelloPayload) => {
      identity = payload;
      void socket.join(payload.roomID);
      if (payload.seat) {
        presenceManager.handleReconnect(
          payload.roomID,
          payload.seat.matchID,
          payload.seat.playerID,
        );
      }
    });

    socket.on('disconnect', () => {
      if (identity?.seat) {
        presenceManager.handleDisconnect(
          identity.roomID,
          identity.seat.matchID,
          identity.seat.playerID,
        );
      }
    });
  });

  return { io, presenceManager };
}

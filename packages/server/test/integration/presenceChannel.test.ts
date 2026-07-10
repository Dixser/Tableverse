import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createPresenceSystem } from '../../src/presence/presenceChannel.js';
import type { SeatStatusChangedEvent } from '@tableverse/shared';

describe('presence channel (real Socket.IO transport)', () => {
  let httpServer: HttpServer | undefined;
  let clients: ClientSocket[] = [];

  beforeEach(() => {
    // Defensive: this suite needs real timers/network I/O regardless of
    // fake-timer state left behind by any other test.
    vi.useRealTimers();
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    clients = [];
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
      httpServer = undefined;
    }
  });

  it(
    'broadcasts a grace_period event on the /presence namespace when a seat disconnects, observed by another room member, independent of any game-state channel',
    async () => {
      httpServer = createServer();
      const { presenceManager } = createPresenceSystem(httpServer, 60_000);
      await new Promise<void>((resolve) =>
        httpServer!.listen(0, resolve),
      );
      const port = (httpServer.address() as AddressInfo).port;

      const seatSocket = ioClient(`http://localhost:${port}/presence`, {
        path: '/presence-socket',
        transports: ['websocket'],
        forceNew: true,
      });
      const observerSocket = ioClient(`http://localhost:${port}/presence`, {
        path: '/presence-socket',
        transports: ['websocket'],
        forceNew: true,
      });
      clients = [seatSocket, observerSocket];

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          seatSocket.on('connect', () => resolve());
          seatSocket.on('connect_error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          observerSocket.on('connect', () => resolve());
          observerSocket.on('connect_error', reject);
        }),
      ]);

      const gracePeriodEvent = new Promise<SeatStatusChangedEvent>(
        (resolve) => {
          observerSocket.on(
            'seatStatusChanged',
            (event: SeatStatusChangedEvent) => {
              if (event.status === 'grace_period') resolve(event);
            },
          );
        },
      );

      seatSocket.emit('hello', {
        roomID: 'room-1',
        seat: { matchID: 'match-1', playerID: '0' },
      });
      // Pure observer: joins the room's broadcasts without identifying a
      // seat of their own (e.g. a spectator watching presence badges).
      observerSocket.emit('hello', { roomID: 'room-1' });

      // Give both 'hello' handlers (which call socket.join) a moment to land.
      await new Promise((resolve) => setTimeout(resolve, 100));

      seatSocket.disconnect();

      const received = await gracePeriodEvent;

      expect(received).toEqual({
        type: 'seatStatusChanged',
        roomID: 'room-1',
        playerID: '0',
        status: 'grace_period',
      });
      expect(presenceManager.getStatus('match-1', '0')).toBe('grace_period');
    },
    10_000,
  );
});

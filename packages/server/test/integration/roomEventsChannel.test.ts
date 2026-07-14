import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createRoomEventsSystem } from '../../src/roomEvents/roomEventsChannel.js';

describe('room-events channel (real Socket.IO transport)', () => {
  let httpServer: HttpServer | undefined;
  let clients: ClientSocket[] = [];

  beforeEach(() => {
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
    'AC1/AC2: a roomChanged broadcast reaches every socket helloed into that roomID, and none helloed into a different roomID',
    async () => {
      httpServer = createServer();
      const { roomChanged } = createRoomEventsSystem(httpServer);
      await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
      const port = (httpServer.address() as AddressInfo).port;

      const connect = () =>
        ioClient(`http://localhost:${port}/room-events`, {
          path: '/room-events-socket',
          transports: ['websocket'],
          forceNew: true,
        });

      const sameRoomA = connect();
      const sameRoomB = connect();
      const otherRoom = connect();
      clients = [sameRoomA, sameRoomB, otherRoom];

      await Promise.all(
        clients.map(
          (c) =>
            new Promise<void>((resolve, reject) => {
              c.on('connect', () => resolve());
              c.on('connect_error', reject);
            }),
        ),
      );

      sameRoomA.emit('hello', { roomID: 'room-1' });
      sameRoomB.emit('hello', { roomID: 'room-1' });
      otherRoom.emit('hello', { roomID: 'room-2' });

      // Give the 'hello' handlers (which call socket.join) a moment to land.
      await new Promise((resolve) => setTimeout(resolve, 100));

      let otherRoomReceived = false;
      otherRoom.on('roomChanged', () => {
        otherRoomReceived = true;
      });

      const receivedA = new Promise<void>((resolve) => sameRoomA.on('roomChanged', () => resolve()));
      const receivedB = new Promise<void>((resolve) => sameRoomB.on('roomChanged', () => resolve()));

      roomChanged('room-1');

      await Promise.all([receivedA, receivedB]);

      // Give a same-tick-emitted (but not addressed) event a moment to
      // arrive if it were (incorrectly) going to.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(otherRoomReceived).toBe(false);
    },
    10_000,
  );
});

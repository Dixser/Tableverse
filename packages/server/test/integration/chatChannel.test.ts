import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createChatSystem } from '../../src/chat/chatChannel.js';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import type { ChatMessage } from '../../src/chat/chatStore.js';

async function connectClient(port: number): Promise<ClientSocket> {
  const socket = ioClient(`http://localhost:${port}/chat`, {
    path: '/chat-socket',
    transports: ['websocket'],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  return socket;
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('chat channel (real Socket.IO transport)', () => {
  let httpServer: HttpServer | undefined;
  let harness: TestHarness | undefined;
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
    await harness?.db.sequelize.close();
    harness = undefined;
  });

  async function setup(): Promise<{ port: number }> {
    harness = await createTestHarness();
    httpServer = createServer();
    createChatSystem(httpServer, {
      users: harness.users,
      rooms: harness.rooms,
      seats: harness.seats,
    });
    await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
    const port = (httpServer!.address() as AddressInfo).port;
    return { port };
  }

  it(
    'AC3/AC4: a spectator-sent message is delivered only to the spectator, a seated-sent message is delivered to everyone',
    async () => {
      const { port } = await setup();
      const { user: seatedUser, sessionToken: seatedToken } =
        await harness!.users.createUser('Seated');
      const { user: spectatorUser, sessionToken: spectatorToken } =
        await harness!.users.createUser('Spectator');
      const room = await harness!.roomService.createRoom(seatedUser.id);
      await harness!.roomService.joinRoom(room.inviteCode, spectatorUser.id);
      await harness!.seats.claimSeat(room.roomID, '0', seatedUser.id);

      const seatedSocket = await connectClient(port);
      const spectatorSocket = await connectClient(port);
      clients = [seatedSocket, spectatorSocket];

      seatedSocket.emit('hello', { roomID: room.roomID, sessionToken: seatedToken });
      spectatorSocket.emit('hello', { roomID: room.roomID, sessionToken: spectatorToken });
      await Promise.all([
        waitForEvent(seatedSocket, 'chatHistory'),
        waitForEvent(spectatorSocket, 'chatHistory'),
      ]);

      // Spectator sends -- only the spectator's own connection should see it.
      const seatedNeverReceives = new Promise<void>((resolve, reject) => {
        seatedSocket.once('chatMessage', (m: ChatMessage) =>
          reject(new Error(`seated socket unexpectedly received: ${m.body}`)),
        );
        setTimeout(resolve, 300);
      });
      const spectatorReceivesOwn = waitForEvent<ChatMessage>(spectatorSocket, 'chatMessage');
      spectatorSocket.emit('sendMessage', { roomID: room.roomID, body: 'spectator says hi' });
      const spectatorMessage = await spectatorReceivesOwn;
      await seatedNeverReceives;
      expect(spectatorMessage.body).toBe('spectator says hi');
      expect(spectatorMessage.authorWasSeated).toBe(false);

      // Seated player sends -- both connections should see it.
      const seatedReceives = waitForEvent<ChatMessage>(seatedSocket, 'chatMessage');
      const spectatorReceives = waitForEvent<ChatMessage>(spectatorSocket, 'chatMessage');
      seatedSocket.emit('sendMessage', { roomID: room.roomID, body: 'seated says hi' });
      const [seatedReceived, spectatorReceived] = await Promise.all([
        seatedReceives,
        spectatorReceives,
      ]);
      expect(seatedReceived.body).toBe('seated says hi');
      expect(spectatorReceived.body).toBe('seated says hi');
      expect(seatedReceived.authorWasSeated).toBe(true);
    },
    10_000,
  );

  it(
    'AC5: hello receives pre-filtered history immediately, per the connecting socket\'s current seated status',
    async () => {
      const { port } = await setup();
      const { user: seatedUser, sessionToken: seatedToken } =
        await harness!.users.createUser('Seated');
      const { user: spectatorUser, sessionToken: spectatorToken } =
        await harness!.users.createUser('Spectator');
      const room = await harness!.roomService.createRoom(seatedUser.id);
      await harness!.roomService.joinRoom(room.inviteCode, spectatorUser.id);
      await harness!.seats.claimSeat(room.roomID, '0', seatedUser.id);

      const seatedSocket = await connectClient(port);
      clients = [seatedSocket];
      seatedSocket.emit('hello', { roomID: room.roomID, sessionToken: seatedToken });
      await waitForEvent(seatedSocket, 'chatHistory');

      seatedSocket.emit('sendMessage', { roomID: room.roomID, body: 'seated history message' });
      await waitForEvent(seatedSocket, 'chatMessage');

      const spectatorSocket = await connectClient(port);
      const lateSpectatorHistory = waitForEvent<ChatMessage[]>(spectatorSocket, 'chatHistory');
      spectatorSocket.emit('hello', { roomID: room.roomID, sessionToken: spectatorToken });
      clients.push(spectatorSocket);
      const history = await lateSpectatorHistory;

      expect(history).toHaveLength(1);
      expect(history[0]?.body).toBe('seated history message');
    },
    10_000,
  );

  it(
    'AC6: a socket presenting no valid session token is disconnected before joining or receiving any history',
    async () => {
      const { port } = await setup();
      const room = await harness!.roomService.createRoom('some-host-id');

      const socket = await connectClient(port);
      clients = [socket];
      const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
      let receivedHistory = false;
      socket.once('chatHistory', () => {
        receivedHistory = true;
      });

      socket.emit('hello', { roomID: room.roomID, sessionToken: 'not-a-real-token' });
      await disconnected;
      expect(receivedHistory).toBe(false);
    },
    10_000,
  );

  it(
    'AC6: a socket for a user who is not a member of the target room is disconnected before joining or receiving any history',
    async () => {
      const { port } = await setup();
      const { user: hostUser } = await harness!.users.createUser('Host');
      const { sessionToken: outsiderToken } = await harness!.users.createUser('Outsider');
      const room = await harness!.roomService.createRoom(hostUser.id);

      const socket = await connectClient(port);
      clients = [socket];
      const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
      let receivedHistory = false;
      socket.once('chatHistory', () => {
        receivedHistory = true;
      });

      socket.emit('hello', { roomID: room.roomID, sessionToken: outsiderToken });
      await disconnected;
      expect(receivedHistory).toBe(false);
    },
    10_000,
  );
});

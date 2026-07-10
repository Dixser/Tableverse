import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { createRoomRouter } from '../../src/rooms/roomRoutes.js';
import { SESSION_TOKEN_HEADER } from '../../src/identity/sessionMiddleware.js';

async function createSessionedUser(harness: TestHarness, displayName: string) {
  return harness.users.createUser(displayName);
}

describe('room routes: permission enforcement', () => {
  let harness: TestHarness | undefined;
  let server: TestServer | undefined;

  afterEach(async () => {
    await server?.close();
    await harness?.db.sequelize.close();
    harness = undefined;
    server = undefined;
  });

  async function setup() {
    harness = await createTestHarness();
    const router = createRoomRouter({
      users: harness.users,
      rooms: harness.rooms,
      seats: harness.seats,
      roomService: harness.roomService,
    });
    server = await startTestServer(router);
    return { harness, server };
  }

  it('AC13/18: a non-host attempting a host-only action (manageSeats/releaseSeat) is rejected with 403 before any state change', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'Host');
    const member = await createSessionedUser(harness, 'Member');

    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string; inviteCode: string } };

    await fetch(`${server.baseUrl}/api/rooms/join`, {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: member.sessionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ inviteCode: room.inviteCode }),
    });

    // Member first legitimately claims seat 0 for themself.
    const claimRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/0/claim`,
      {
        method: 'POST',
        headers: { [SESSION_TOKEN_HEADER]: member.sessionToken },
      },
    );
    expect(claimRes.status).toBe(200);

    // Member (not host) attempts a host-only action: releasing a seat.
    const releaseRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/0/release`,
      {
        method: 'POST',
        headers: { [SESSION_TOKEN_HEADER]: member.sessionToken },
      },
    );
    expect(releaseRes.status).toBe(403);

    // Confirm no state change: seat 0 is still claimed (release did not happen).
    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(1);
    expect(seatsAfter[0]?.playerID).toBe('0');

    // The host performing the same action succeeds.
    const hostReleaseRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/0/release`,
      {
        method: 'POST',
        headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
      },
    );
    expect(hostReleaseRes.status).toBe(204);
    const seatsAfterHostRelease = await harness.seats.getSeatsForRoom(
      room.roomID,
    );
    expect(seatsAfterHostRelease).toHaveLength(0);
  });

  it('rejects requests with no/invalid session token with 401', async () => {
    const { server } = await setup();
    const res = await fetch(`${server.baseUrl}/api/rooms`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-member acting on a room they have not joined with 403', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'Host');
    const outsider = await createSessionedUser(harness, 'Outsider');

    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string } };

    const res = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/0/claim`,
      {
        method: 'POST',
        headers: { [SESSION_TOKEN_HEADER]: outsider.sessionToken },
      },
    );
    expect(res.status).toBe(403);
  });
});

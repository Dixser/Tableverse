import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { createRoomRouter } from '../../src/rooms/roomRoutes.js';
import { SESSION_TOKEN_HEADER } from '../../src/identity/sessionMiddleware.js';
import { dummyGameModule } from '@tableverse/game-core/testing/fixtures/dummyGame.js';

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

  it('lets the host enable allowMultiSeat via /settings, then claim a second seat for solo play; a member is rejected with 403', async () => {
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

    // A member (not host) cannot toggle room settings.
    const memberSettingsRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: member.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ allowMultiSeat: true }),
      },
    );
    expect(memberSettingsRes.status).toBe(403);

    // The host claims seat 0, then enables allowMultiSeat, then claims
    // seat 1 too -- solo play (spec.md story 4).
    const claimSeat0 = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/0/claim`,
      { method: 'POST', headers: { [SESSION_TOKEN_HEADER]: host.sessionToken } },
    );
    expect(claimSeat0.status).toBe(200);

    const settingsRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: host.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ allowMultiSeat: true }),
      },
    );
    expect(settingsRes.status).toBe(200);
    const { room: updatedRoom } = (await settingsRes.json()) as {
      room: { allowMultiSeat: boolean };
    };
    expect(updatedRoom.allowMultiSeat).toBe(true);

    const claimSeat1 = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/seats/1/claim`,
      { method: 'POST', headers: { [SESSION_TOKEN_HEADER]: host.sessionToken } },
    );
    expect(claimSeat1.status).toBe(200);

    const seats = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seats).toHaveLength(2);
    expect(seats.every((s) => s.userID === host.user.id)).toBe(true);
  });

  it('POST /:roomID/settings validates gameSettings against the selected game\'s schema: valid input persists (200), invalid input is rejected (400, unchanged), a non-host is rejected (403)', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const router = createRoomRouter({
      users: harness.users,
      rooms: harness.rooms,
      seats: harness.seats,
      roomService: harness.roomService,
    });
    server = await startTestServer(router);
    const host = await createSessionedUser(harness, 'HostSettings');
    const member = await createSessionedUser(harness, 'MemberSettings');

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

    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);

    // Non-host is rejected before any state change.
    const memberRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: member.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ gameSettings: { variant: 'b' } }),
      },
    );
    expect(memberRes.status).toBe(403);

    // Invalid input (outside the declared enum) is rejected, storage unchanged.
    const invalidRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: host.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ gameSettings: { variant: 'not-a-real-variant' } }),
      },
    );
    expect(invalidRes.status).toBe(400);
    const afterInvalid = await harness.rooms.getById(room.roomID);
    expect(afterInvalid?.gameSettings).toEqual({});

    // Valid input persists and is reflected in the response.
    const validRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: host.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ gameSettings: { variant: 'b' } }),
      },
    );
    expect(validRes.status).toBe(200);
    const { room: updatedRoom } = (await validRes.json()) as {
      room: { gameSettings: Record<string, unknown> };
    };
    expect(updatedRoom.gameSettings).toEqual({ variant: 'b' });
    const afterValid = await harness.rooms.getById(room.roomID);
    expect(afterValid?.gameSettings).toEqual({ variant: 'b' });
  });

  it('POST /:roomID/settings still accepts the legacy allowMultiSeat-only body shape unchanged (no gameSettings key present)', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'HostLegacy');

    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string } };

    const settingsRes = await fetch(
      `${server.baseUrl}/api/rooms/${room.roomID}/settings`,
      {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: host.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ allowMultiSeat: true }),
      },
    );
    expect(settingsRes.status).toBe(200);
    const { room: updatedRoom } = (await settingsRes.json()) as {
      room: { allowMultiSeat: boolean };
    };
    expect(updatedRoom.allowMultiSeat).toBe(true);
  });

  it('rejects a host calling /leave with 403 (the host cannot leave the room)', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'Host2');
    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string } };

    const leaveRes = await fetch(`${server.baseUrl}/api/rooms/${room.roomID}/leave`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    expect(leaveRes.status).toBe(403);
  });

  it('lets a member leave the room (cascading their seats) and rejects a non-host member calling /kick', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'Host3');
    const member = await createSessionedUser(harness, 'Member3');
    const other = await createSessionedUser(harness, 'Other3');

    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string; inviteCode: string } };

    for (const u of [member, other]) {
      await fetch(`${server.baseUrl}/api/rooms/join`, {
        method: 'POST',
        headers: {
          [SESSION_TOKEN_HEADER]: u.sessionToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ inviteCode: room.inviteCode }),
      });
    }
    await fetch(`${server.baseUrl}/api/rooms/${room.roomID}/seats/0/claim`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: member.sessionToken },
    });

    // A non-host member cannot kick.
    const kickRes = await fetch(`${server.baseUrl}/api/rooms/${room.roomID}/kick`, {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: other.sessionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetUserID: member.user.id }),
    });
    expect(kickRes.status).toBe(403);

    // The member leaves voluntarily; their seat is released.
    const leaveRes = await fetch(`${server.baseUrl}/api/rooms/${room.roomID}/leave`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: member.sessionToken },
    });
    expect(leaveRes.status).toBe(200);

    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(0);
  });

  it('AC6: a kicked player can rejoin the room with the same invite code afterward (no ban list)', async () => {
    const { harness, server } = await setup();
    const host = await createSessionedUser(harness, 'Host4');
    const target = await createSessionedUser(harness, 'Target4');

    const createRes = await fetch(`${server.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: host.sessionToken },
    });
    const { room } = (await createRes.json()) as { room: { roomID: string; inviteCode: string } };

    await fetch(`${server.baseUrl}/api/rooms/join`, {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: target.sessionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ inviteCode: room.inviteCode }),
    });

    const kickRes = await fetch(`${server.baseUrl}/api/rooms/${room.roomID}/kick`, {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: host.sessionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetUserID: target.user.id }),
    });
    expect(kickRes.status).toBe(200);
    const { room: afterKick } = (await kickRes.json()) as {
      room: { members: { userID: string }[] };
    };
    expect(afterKick.members.some((m) => m.userID === target.user.id)).toBe(false);

    // No ban list -- rejoining with the same invite code succeeds.
    const rejoinRes = await fetch(`${server.baseUrl}/api/rooms/join`, {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: target.sessionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ inviteCode: room.inviteCode }),
    });
    expect(rejoinRes.status).toBe(200);
    const { room: afterRejoin } = (await rejoinRes.json()) as {
      room: { members: { userID: string }[] };
    };
    expect(afterRejoin.members.some((m) => m.userID === target.user.id)).toBe(true);
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

import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import { dummyGameModule } from '@tableverse/game-core/testing/fixtures/dummyGame.js';

describe('RoomService', () => {
  let harness: TestHarness | undefined;

  afterEach(async () => {
    await harness?.db.sequelize.close();
    harness = undefined;
  });

  it('AC1: createRoom produces a Room with a unique inviteCode, lobby status, null currentMatchID, and the creator as sole host member', async () => {
    harness = await createTestHarness();
    const room = await harness.roomService.createRoom('user-host');
    expect(room.inviteCode).toHaveLength(6);
    expect(room.status).toBe('lobby');
    expect(room.currentMatchID).toBeNull();
    expect(room.hostUserID).toBe('user-host');
    expect(room.members).toEqual([{ userID: 'user-host', role: 'host' }]);
  });

  it('AC2: joinRoom with a valid inviteCode adds the joiner as a member; an unknown code is rejected', async () => {
    harness = await createTestHarness();
    const room = await harness.roomService.createRoom('user-host');

    const joined = await harness.roomService.joinRoom(
      room.inviteCode,
      'user-guest',
    );
    expect(joined.members).toContainEqual({
      userID: 'user-guest',
      role: 'member',
    });

    await expect(
      harness.roomService.joinRoom('ZZZZZZ', 'user-other'),
    ).rejects.toThrow();
  });

  it('AC14/15: changeGame only works in lobby, resets seats and gameSettings', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.seats.claimSeat(room.roomID, '0', 'user-host');

    const changed = await harness.roomService.changeGame(
      room.roomID,
      dummyGameModule.id,
    );
    expect(changed.selectedGameID).toBe(dummyGameModule.id);
    expect(changed.gameSettings).toEqual({});
    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(0);
  });

  it('AC7/16: startMatch creates a match and issues credentials for every claimed seat, including a user holding every seat (solo play)', async () => {
    harness = await createTestHarness([dummyGameModule]);
    await harness.users.createUser('SoloPlayer'); // ensures a display name exists
    const room = await harness.roomService.createRoom('user-solo');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);
    await harness.rooms.update(room.roomID, { allowMultiSeat: true });

    for (let p = 0; p < dummyGameModule.minPlayers; p++) {
      await harness.seats.claimSeat(room.roomID, String(p), 'user-solo');
    }

    const { room: started, credentialsByUserID } =
      await harness.roomService.startMatch(room.roomID);

    expect(started.status).toBe('in_game');
    expect(started.currentMatchID).toBeTruthy();

    const soloCredentials = credentialsByUserID.get('user-solo') ?? [];
    expect(soloCredentials).toHaveLength(dummyGameModule.minPlayers);
    for (const cred of soloCredentials) {
      expect(cred.matchID).toBe(started.currentMatchID);
      expect(cred.credentials).toBeTruthy();
    }

    // The created match is indistinguishable in storage from one created
    // for distinct users — same createMatch/setMetadata path either way.
    const fetched = await harness.storage.fetch(started.currentMatchID!, {
      metadata: true,
    });
    expect(fetched.metadata?.players[0]?.credentials).toBeTruthy();
  });

  it('AC6: claiming a seat while lobby creates a room-level reservation only (no credentials); claiming an open seat while in_game immediately issues credentials', async () => {
    harness = await createTestHarness([dummyGameModule]);
    await harness.users.createUser('Alice');
    await harness.users.createUser('Bob');
    const room = await harness.roomService.createRoom('user-a');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);

    // Lobby-phase claim: no credential yet.
    const lobbyClaim = await harness.roomService.claimSeat(room.roomID, '0', 'user-a');
    expect(lobbyClaim.credential).toBeNull();

    const { room: started } = await harness.roomService.startMatch(room.roomID);
    expect(started.status).toBe('in_game');

    // Seat 1 was never claimed pre-match -- claiming it now (room already
    // in_game) must mint a credential immediately, since a matchID exists.
    const midGameClaim = await harness.roomService.claimSeat(room.roomID, '1', 'user-b');
    expect(midGameClaim.credential).not.toBeNull();
    expect(midGameClaim.credential?.matchID).toBe(started.currentMatchID);
    expect(midGameClaim.credential?.playerID).toBe('1');
    expect(midGameClaim.credential?.credentials).toBeTruthy();

    // getMyCredentials lets the seat's owner retrieve it on any later fetch
    // (e.g. after a reload) -- this is how a user other than whoever
    // called startMatch/claimSeat receives their own credential.
    const myCreds = await harness.roomService.getMyCredentials(room.roomID, 'user-b');
    expect(myCreds).toEqual([midGameClaim.credential]);

    // Confirmed at the storage level too: player 1's metadata now carries
    // the same credential that was returned.
    const fetched = await harness.storage.fetch(started.currentMatchID!, {
      metadata: true,
    });
    expect(fetched.metadata?.players[1]?.credentials).toBe(
      midGameClaim.credential?.credentials,
    );
  });

  it('AC17: endMatch returns to lobby, clears currentMatchID, and preserves seats when the game was not changed', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);
    await harness.seats.claimSeat(room.roomID, '0', 'user-host');
    const { room: started } = await harness.roomService.startMatch(
      room.roomID,
    );

    const ended = await harness.roomService.endMatch(started.roomID);
    expect(ended.status).toBe('lobby');
    expect(ended.currentMatchID).toBeNull();

    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(1);
    expect(seatsAfter[0]?.userID).toBe('user-host');
  });
});

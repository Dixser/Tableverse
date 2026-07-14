import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import { dummyGameModule } from '@tableverse/game-core/testing/fixtures/dummyGame.js';
import { getGameModule } from '@tableverse/game-core';
import { PresenceManager } from '../../src/presence/presenceManager.js';
import type { SeatStatusChangedEvent } from '@tableverse/shared';

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

  it('startMatch tells the game which seats are actually claimed, so a game whose rules depend on the real player count is not stuck with permanent phantom seats', async () => {
    const loveletterModule = getGameModule('loveletter-v1')!;
    harness = await createTestHarness([loveletterModule]);
    await harness.users.createUser('Alice');
    await harness.users.createUser('Bob');
    const room = await harness.roomService.createRoom('user-a');
    await harness.roomService.changeGame(room.roomID, loveletterModule.id);
    // loveletterModule.maxPlayers is 6, but only 2 real seats are claimed --
    // this is exactly the "2 players game" shape that used to leave 4
    // engine seats permanently alive, since roomService.startMatch always
    // creates the boardgame.io match with numPlayers: maxPlayers.
    await harness.seats.claimSeat(room.roomID, '0', 'user-a');
    await harness.seats.claimSeat(room.roomID, '1', 'user-b');

    const { room: started } = await harness.roomService.startMatch(room.roomID);
    const fetched = await harness.storage.fetch(started.currentMatchID!, { state: true });
    const G = fetched.state?.G as { activeSeatIDs: string[]; eliminated: Record<string, boolean> };

    expect(G.activeSeatIDs).toEqual(['0', '1']);
    expect(G.eliminated).toEqual({
      '0': false,
      '1': false,
      '2': true,
      '3': true,
      '4': true,
      '5': true,
    });
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

  it('leaveRoom removes the member and cascades every seat they held (including more than one, under allowMultiSeat)', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.rooms.update(room.roomID, { allowMultiSeat: true });
    const joined = await harness.roomService.joinRoom(room.inviteCode, 'user-guest');
    expect(joined.members).toContainEqual({ userID: 'user-guest', role: 'member' });
    await harness.seats.claimSeat(room.roomID, '0', 'user-guest');
    await harness.seats.claimSeat(room.roomID, '1', 'user-guest');

    const updated = await harness.roomService.leaveRoom(room.roomID, 'user-guest');

    expect(updated.members).not.toContainEqual({ userID: 'user-guest', role: 'member' });
    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(0);
  });

  it('kickPlayer removes the target member and cascades their seats, identical in effect to leaveRoom', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.joinRoom(room.inviteCode, 'user-guest');
    await harness.seats.claimSeat(room.roomID, '0', 'user-guest');

    const updated = await harness.roomService.kickPlayer(
      room.roomID,
      'user-host',
      'user-guest',
    );

    expect(updated.members).toEqual([{ userID: 'user-host', role: 'host' }]);
    const seatsAfter = await harness.seats.getSeatsForRoom(room.roomID);
    expect(seatsAfter).toHaveLength(0);
  });

  it('kickPlayer rejects a user attempting to kick themself', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');

    await expect(
      harness.roomService.kickPlayer(room.roomID, 'user-host', 'user-host'),
    ).rejects.toThrow(/cannot kick themself/);
  });

  it('kickPlayer rejects a target who is not a member of the room', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');

    await expect(
      harness.roomService.kickPlayer(room.roomID, 'user-host', 'not-a-member'),
    ).rejects.toThrow(/not a member/);
  });

  it('setGameSettings persists a valid settings object and returns the updated Room', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);

    const updated = await harness.roomService.setGameSettings(room.roomID, {
      variant: 'b',
    });
    expect(updated.gameSettings).toEqual({ variant: 'b' });

    const persisted = await harness.rooms.getById(room.roomID);
    expect(persisted?.gameSettings).toEqual({ variant: 'b' });
  });

  it('setGameSettings rejects a room that is in_game, mirroring changeGame\'s lobby-only guard', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);
    await harness.rooms.update(room.roomID, { allowMultiSeat: true });
    await harness.seats.claimSeat(room.roomID, '0', 'user-host');
    await harness.seats.claimSeat(room.roomID, '1', 'user-host');
    const { room: started } = await harness.roomService.startMatch(room.roomID);

    await expect(
      harness.roomService.setGameSettings(started.roomID, { variant: 'b' }),
    ).rejects.toThrow(/in_game/);
  });

  it('setGameSettings rejects a value that fails the selected game\'s schema, leaving stored gameSettings unchanged', async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);
    await harness.roomService.setGameSettings(room.roomID, { variant: 'a' });

    await expect(
      harness.roomService.setGameSettings(room.roomID, { variant: 'z' }),
    ).rejects.toThrow();

    const persisted = await harness.rooms.getById(room.roomID);
    expect(persisted?.gameSettings).toEqual({ variant: 'a' });
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

  it("endMatch clears each seat's presence state and suppresses the seat socket's subsequent disconnect, instead of leaving players falsely shown as reconnecting in the lobby", async () => {
    harness = await createTestHarness([dummyGameModule]);
    const room = await harness.roomService.createRoom('user-host');
    await harness.roomService.changeGame(room.roomID, dummyGameModule.id);
    await harness.seats.claimSeat(room.roomID, '0', 'user-host');
    const { room: started } = await harness.roomService.startMatch(room.roomID);
    const matchID = started.currentMatchID!;

    const events: SeatStatusChangedEvent[] = [];
    const presenceManager = new PresenceManager((e) => events.push(e));
    harness.roomService.setPresenceManager(presenceManager);

    // A real disconnect earlier in the match left the seat in grace_period.
    presenceManager.handleDisconnect(room.roomID, matchID, '0');
    expect(presenceManager.getStatus(matchID, '0')).toBe('grace_period');

    await harness.roomService.endMatch(started.roomID);

    // The stale grace_period badge is corrected immediately...
    expect(presenceManager.getStatus(matchID, '0')).toBe('connected');
    expect(events.at(-1)).toEqual({
      type: 'seatStatusChanged',
      roomID: room.roomID,
      playerID: '0',
      status: 'connected',
    });

    // ...and the seat's presence socket disconnecting afterward, as
    // useSeatClients tears down the ended match client-side, must not be
    // mistaken for a real drop and restart the grace-period timer.
    presenceManager.handleDisconnect(room.roomID, matchID, '0');
    expect(presenceManager.getStatus(matchID, '0')).toBe('connected');
  });
});

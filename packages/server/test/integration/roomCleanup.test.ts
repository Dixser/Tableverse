import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '../helpers/testHarness.js';
import {
  closeStaleRooms,
  purgeClosedRooms,
  runRoomCleanupSweep,
} from '../../src/rooms/roomCleanup.js';
import { RoomServiceError } from '../../src/rooms/roomService.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sequelize won't let a bulk/instance update touch `updatedAt` on its own --
 * it's a managed timestamp attribute, and a values object containing only
 * that field gets silently dropped (0 rows affected). A raw UPDATE is the
 * only reliable way to backdate it for this test; the string format has to
 * match what Sequelize's sqlite dialect itself writes (`YYYY-MM-DD
 * HH:MM:SS.mmm +00:00`), or reads back as an Invalid Date.
 */
function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', ' +00:00');
}

async function ageRoom(harness: TestHarness, roomID: string, msAgo: number): Promise<void> {
  await harness.db.sequelize.query(
    'UPDATE rooms SET updatedAt = :updatedAt WHERE roomId = :roomId',
    { replacements: { updatedAt: toSqliteTimestamp(new Date(Date.now() - msAgo)), roomId: roomID } },
  );
}

async function closeRoom(harness: TestHarness, roomID: string, msAgo: number): Promise<void> {
  const row = await harness.db.models.Room.findByPk(roomID);
  row!.closedAt = new Date(Date.now() - msAgo);
  await row!.save({ silent: true });
}

async function ageSeat(
  harness: TestHarness,
  roomID: string,
  playerID: string,
  msAgo: number,
): Promise<void> {
  const row = await harness.db.models.RoomSeat.findOne({
    where: { roomId: roomID, playerId: playerID },
  });
  row!.claimedAt = new Date(Date.now() - msAgo);
  await row!.save();
}

describe('roomCleanup', () => {
  let harness: TestHarness | undefined;

  afterEach(async () => {
    await harness?.db.sequelize.close();
    harness = undefined;
  });

  describe('closeStaleRooms', () => {
    it('closes a lobby room idle past the threshold', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await ageRoom(harness, room.roomID, 25 * HOUR_MS);

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([room.roomID]);
      const after = await harness.rooms.getById(room.roomID);
      expect(after?.closedAt).not.toBeNull();
    });

    it('leaves a recently-active lobby room alone', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([]);
      const after = await harness.rooms.getById(room.roomID);
      expect(after?.closedAt).toBeNull();
    });

    it('does not close a room with an old updatedAt but a recent seat claim', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await harness.seats.claimSeat(room.roomID, '0', 'host-1');
      await ageRoom(harness, room.roomID, 25 * HOUR_MS);
      // seat claimedAt stays "now" -- room should still count as active

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([]);
      const after = await harness.rooms.getById(room.roomID);
      expect(after?.closedAt).toBeNull();
    });

    it('closes a room whose only seat claim is also stale', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await harness.seats.claimSeat(room.roomID, '0', 'host-1');
      await ageRoom(harness, room.roomID, 25 * HOUR_MS);
      await ageSeat(harness, room.roomID, '0', 25 * HOUR_MS);

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([room.roomID]);
    });

    it('never closes an in_game room, regardless of age', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await harness.db.models.Room.update(
        { status: 'in_game' },
        { where: { roomId: room.roomID } },
      );
      await ageRoom(harness, room.roomID, 365 * DAY_MS);

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([]);
    });

    it('does not reprocess an already-closed room', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await ageRoom(harness, room.roomID, 25 * HOUR_MS);
      await closeRoom(harness, room.roomID, 25 * HOUR_MS);

      const closed = await closeStaleRooms(harness.rooms, 24 * HOUR_MS);

      expect(closed).toEqual([]);
    });
  });

  describe('purgeClosedRooms', () => {
    it('deletes a room closed longer than the purge threshold, including its seats', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await harness.seats.claimSeat(room.roomID, '0', 'host-1');
      await closeRoom(harness, room.roomID, 31 * DAY_MS);

      const purged = await purgeClosedRooms(harness.rooms, harness.seats, 30 * DAY_MS);

      expect(purged).toEqual([room.roomID]);
      expect(await harness.rooms.getById(room.roomID)).toBeNull();
      expect(await harness.seats.getSeatsForRoom(room.roomID)).toEqual([]);
    });

    it('leaves a recently-closed room alone', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await closeRoom(harness, room.roomID, 1 * DAY_MS);

      const purged = await purgeClosedRooms(harness.rooms, harness.seats, 30 * DAY_MS);

      expect(purged).toEqual([]);
      expect(await harness.rooms.getById(room.roomID)).not.toBeNull();
    });

    it('never purges a room that has not been closed, regardless of age', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await ageRoom(harness, room.roomID, 365 * DAY_MS);

      const purged = await purgeClosedRooms(harness.rooms, harness.seats, 30 * DAY_MS);

      expect(purged).toEqual([]);
      expect(await harness.rooms.getById(room.roomID)).not.toBeNull();
    });
  });

  describe('runRoomCleanupSweep', () => {
    it('closes newly-stale rooms and purges long-closed ones in one call', async () => {
      harness = await createTestHarness();
      const toClose = await harness.roomService.createRoom('host-1');
      await ageRoom(harness, toClose.roomID, 25 * HOUR_MS);
      const toPurge = await harness.roomService.createRoom('host-2');
      await closeRoom(harness, toPurge.roomID, 31 * DAY_MS);

      const result = await runRoomCleanupSweep(harness.rooms, harness.seats, {
        staleMs: 24 * HOUR_MS,
        purgeAfterMs: 30 * DAY_MS,
      });

      expect(result.closed).toEqual([toClose.roomID]);
      expect(result.purged).toEqual([toPurge.roomID]);
      expect(await harness.rooms.getById(toClose.roomID)).not.toBeNull();
      expect(await harness.rooms.getById(toPurge.roomID)).toBeNull();
    });
  });

  describe('closed-room enforcement', () => {
    it('rejects joinRoom for a closed room', async () => {
      harness = await createTestHarness();
      const room = await harness.roomService.createRoom('host-1');
      await closeRoom(harness, room.roomID, 1 * HOUR_MS);

      await expect(
        harness.roomService.joinRoom(room.inviteCode, 'user-b'),
      ).rejects.toThrow(RoomServiceError);
    });
  });
});

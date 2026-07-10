import { afterEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { createTestDb, type TestDb } from '../helpers/testDb.js';
import { SequelizeRoomRepository } from '../../src/rooms/roomRepository.js';
import { SeatClaimError, SeatService } from '../../src/rooms/seatService.js';
import type { Room } from '@tableverse/shared';

async function createRoom(
  db: TestDb,
  overrides: Partial<Room> = {},
): Promise<Room> {
  const repo = new SequelizeRoomRepository(db.models);
  const code = await repo.generateUniqueInviteCode();
  const room: Room = {
    roomID: nanoid(16),
    inviteCode: code,
    hostUserID: 'host-1',
    selectedGameID: null,
    currentMatchID: null,
    status: 'lobby',
    allowMultiSeat: false,
    gameSettings: {},
    members: [{ userID: 'host-1', role: 'host' }],
    ...overrides,
  };
  await repo.create(room);
  return room;
}

describe('SeatService', () => {
  let db: TestDb | undefined;

  afterEach(async () => {
    await db?.sequelize.close();
    db = undefined;
  });

  it('claims an open seat', async () => {
    db = await createTestDb();
    const roomRepo = new SequelizeRoomRepository(db.models);
    const seats = new SeatService(db.models, roomRepo);
    const room = await createRoom(db);

    const assignment = await seats.claimSeat(room.roomID, '0', 'user-a');
    expect(assignment.userID).toBe('user-a');
    expect(assignment.playerID).toBe('0');
  });

  it('rejects claiming an already-claimed seat regardless of allowMultiSeat', async () => {
    db = await createTestDb();
    const roomRepo = new SequelizeRoomRepository(db.models);
    const seats = new SeatService(db.models, roomRepo);
    const room = await createRoom(db, { allowMultiSeat: true });

    await seats.claimSeat(room.roomID, '0', 'user-a');
    await expect(
      seats.claimSeat(room.roomID, '0', 'user-b'),
    ).rejects.toThrow(SeatClaimError);
  });

  it('rejects a second seat for the same user when allowMultiSeat is false', async () => {
    db = await createTestDb();
    const roomRepo = new SequelizeRoomRepository(db.models);
    const seats = new SeatService(db.models, roomRepo);
    const room = await createRoom(db, { allowMultiSeat: false });

    await seats.claimSeat(room.roomID, '0', 'user-a');
    await expect(
      seats.claimSeat(room.roomID, '1', 'user-a'),
    ).rejects.toThrow(SeatClaimError);
  });

  it('allows a second (and further) seat for the same user when allowMultiSeat is true — including solo play claiming every seat', async () => {
    db = await createTestDb();
    const roomRepo = new SequelizeRoomRepository(db.models);
    const seats = new SeatService(db.models, roomRepo);
    const room = await createRoom(db, { allowMultiSeat: true });

    await seats.claimSeat(room.roomID, '0', 'user-a');
    await seats.claimSeat(room.roomID, '1', 'user-a');
    await seats.claimSeat(room.roomID, '2', 'user-a');

    const all = await seats.getSeatsForRoom(room.roomID);
    expect(all).toHaveLength(3);
    expect(all.every((s) => s.userID === 'user-a')).toBe(true);
  });

  it('claiming issues a seat assignment that leaveSeat can remove, freeing the seat for reclaim', async () => {
    db = await createTestDb();
    const roomRepo = new SequelizeRoomRepository(db.models);
    const seats = new SeatService(db.models, roomRepo);
    const room = await createRoom(db);

    await seats.claimSeat(room.roomID, '0', 'user-a');
    await seats.leaveSeat(room.roomID, '0');
    const reclaimed = await seats.claimSeat(room.roomID, '0', 'user-b');
    expect(reclaimed.userID).toBe('user-b');
  });
});

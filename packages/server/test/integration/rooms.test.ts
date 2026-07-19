import { afterEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { createTestDb, type TestDb } from '../helpers/testDb.js';
import { SequelizeRoomRepository } from '../../src/rooms/roomRepository.js';
import type { Room } from '@tableverse/shared';

function makeRoom(overrides: Partial<Room> = {}, inviteCode: string): Room {
  return {
    roomID: nanoid(16),
    inviteCode,
    hostUserID: 'host-1',
    selectedGameID: null,
    currentMatchID: null,
    status: 'lobby',
    allowMultiSeat: false,
    gameSettings: {},
    members: [{ userID: 'host-1', role: 'host' }],
    closedAt: null,
    ...overrides,
  };
}

describe('SequelizeRoomRepository', () => {
  let db: TestDb | undefined;

  afterEach(async () => {
    await db?.sequelize.close();
    db = undefined;
  });

  it('generates a unique invite code', async () => {
    db = await createTestDb();
    const repo = new SequelizeRoomRepository(db.models);
    const code = await repo.generateUniqueInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('create() persists a room retrievable by getById and getByInviteCode', async () => {
    db = await createTestDb();
    const repo = new SequelizeRoomRepository(db.models);
    const code = await repo.generateUniqueInviteCode();
    const room = makeRoom({}, code);
    await repo.create(room);

    const byId = await repo.getById(room.roomID);
    expect(byId).toEqual(room);

    const byCode = await repo.getByInviteCode(code);
    expect(byCode).toEqual(room);
  });

  it('getByInviteCode returns null for an unknown code', async () => {
    db = await createTestDb();
    const repo = new SequelizeRoomRepository(db.models);
    expect(await repo.getByInviteCode('ZZZZZZ')).toBeNull();
  });

  it('update() patches only the given fields', async () => {
    db = await createTestDb();
    const repo = new SequelizeRoomRepository(db.models);
    const code = await repo.generateUniqueInviteCode();
    const room = makeRoom({}, code);
    await repo.create(room);

    await repo.update(room.roomID, {
      status: 'in_game',
      currentMatchID: 'match-1',
    });

    const updated = await repo.getById(room.roomID);
    expect(updated?.status).toBe('in_game');
    expect(updated?.currentMatchID).toBe('match-1');
    expect(updated?.hostUserID).toBe(room.hostUserID);
  });
});

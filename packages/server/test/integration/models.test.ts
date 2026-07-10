import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/testDb.js';

describe('Sequelize models sync', () => {
  let db: TestDb | undefined;

  afterEach(async () => {
    await db?.sequelize.close();
    db = undefined;
  });

  it('syncs User, Room, RoomMember, RoomSeat against an in-memory SQLite DB with no errors', async () => {
    db = await createTestDb();
    expect(db.sequelize).toBeDefined();
  });

  it('round-trips a User row', async () => {
    db = await createTestDb();
    const user = await db.models.User.create({
      userId: 'u1',
      displayName: 'Alice',
      sessionToken: 'tok1',
    });
    const found = await db.models.User.findByPk('u1');
    expect(found?.displayName).toBe('Alice');
    expect(user.createdAt).toBeInstanceOf(Date);
  });
});

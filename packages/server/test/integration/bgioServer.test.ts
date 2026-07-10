import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/testDb.js';
import { SqliteStorageAdapter } from '../../src/bgio/storage/sqliteStorageAdapter.js';
import { createBgioServer } from '../../src/bgio/serverConfig.js';

describe('boardgame.io Server config', () => {
  let db: TestDb | undefined;

  afterEach(async () => {
    await db?.sequelize.close();
    db = undefined;
  });

  it('boots without error against an empty games array (feature 001 ships no playable game)', async () => {
    db = await createTestDb();
    const storage = new SqliteStorageAdapter(db.models);
    expect(() => createBgioServer([], storage)).not.toThrow();
    const bgio = createBgioServer([], storage);
    expect(bgio.app).toBeDefined();
    expect(bgio.db).toBe(storage);
  });
});

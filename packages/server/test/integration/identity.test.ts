import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/testDb.js';
import { UserRepository } from '../../src/identity/userRepository.js';
import { resolveOrCreateSession } from '../../src/identity/session.js';

describe('identity: session resolution', () => {
  let db: TestDb | undefined;

  afterEach(async () => {
    await db?.sequelize.close();
    db = undefined;
  });

  it('a request with no session token creates a new User and issues a token', async () => {
    db = await createTestDb();
    const repo = new UserRepository(db.models);
    const { user, sessionToken } = await resolveOrCreateSession(repo, {
      displayName: 'Alice',
    });
    expect(user.displayName).toBe('Alice');
    expect(sessionToken).toBeTruthy();
  });

  it('a request with a known token resolves the same User', async () => {
    db = await createTestDb();
    const repo = new UserRepository(db.models);
    const created = await resolveOrCreateSession(repo, {
      displayName: 'Bob',
    });
    const resolved = await resolveOrCreateSession(repo, {
      sessionToken: created.sessionToken,
    });
    expect(resolved.user.id).toBe(created.user.id);
    expect(resolved.sessionToken).toBe(created.sessionToken);
  });

  it('rejects a request with neither a valid token nor a displayName', async () => {
    db = await createTestDb();
    const repo = new UserRepository(db.models);
    await expect(resolveOrCreateSession(repo, {})).rejects.toThrow();
  });

  it('falls back to creating a new User when an unknown token is presented with a displayName', async () => {
    db = await createTestDb();
    const repo = new UserRepository(db.models);
    const { user } = await resolveOrCreateSession(repo, {
      sessionToken: 'unknown-token',
      displayName: 'Carol',
    });
    expect(user.displayName).toBe('Carol');
  });
});

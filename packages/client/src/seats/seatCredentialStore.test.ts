import { beforeEach, describe, expect, it } from 'vitest';
import { seatCredentialStore } from './seatCredentialStore.js';

describe('seatCredentialStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('add() then getForMatch() round-trips a credential', () => {
    seatCredentialStore.add({
      matchID: 'match-1',
      playerID: '0',
      credentials: 'cred-abc',
    });
    expect(seatCredentialStore.getForMatch('match-1')).toEqual([
      { matchID: 'match-1', playerID: '0', credentials: 'cred-abc' },
    ]);
  });

  it('supports multiple seats across multiple matches (multi-seat claiming / solo play)', () => {
    seatCredentialStore.add({ matchID: 'm1', playerID: '0', credentials: 'a' });
    seatCredentialStore.add({ matchID: 'm1', playerID: '1', credentials: 'b' });
    seatCredentialStore.add({ matchID: 'm2', playerID: '0', credentials: 'c' });

    expect(seatCredentialStore.getForMatch('m1')).toHaveLength(2);
    expect(seatCredentialStore.getForMatch('m2')).toHaveLength(1);
  });

  it('remove() deletes exactly the given seat, leaving others intact', () => {
    seatCredentialStore.add({ matchID: 'm1', playerID: '0', credentials: 'a' });
    seatCredentialStore.add({ matchID: 'm1', playerID: '1', credentials: 'b' });

    seatCredentialStore.remove('m1', '0');

    expect(seatCredentialStore.getForMatch('m1')).toEqual([
      { matchID: 'm1', playerID: '1', credentials: 'b' },
    ]);
  });

  it('add() overwrites an existing entry for the same matchID+playerID rather than duplicating it', () => {
    seatCredentialStore.add({ matchID: 'm1', playerID: '0', credentials: 'old' });
    seatCredentialStore.add({ matchID: 'm1', playerID: '0', credentials: 'new' });

    expect(seatCredentialStore.getForMatch('m1')).toEqual([
      { matchID: 'm1', playerID: '0', credentials: 'new' },
    ]);
  });

  it('survives being read back after a simulated reload (new call, same localStorage)', () => {
    seatCredentialStore.add({ matchID: 'm1', playerID: '0', credentials: 'a' });
    // A "reload" is just a fresh read from localStorage -- the store has
    // no in-memory state of its own.
    expect(seatCredentialStore.getAll()).toEqual([
      { matchID: 'm1', playerID: '0', credentials: 'a' },
    ]);
  });
});

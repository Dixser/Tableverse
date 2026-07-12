import { describe, expect, it } from 'vitest';
import { ChatStore, type ChatMessage } from '../../src/chat/chatStore.js';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    roomID: 'room-1',
    authorUserID: 'user-1',
    authorDisplayName: 'Alice',
    authorWasSeated: true,
    body: 'hello',
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ChatStore', () => {
  it('AC1/AC2: a spectator-authored message is visible only to a viewer who is currently unseated; a seated-authored message is visible to everyone', () => {
    const store = new ChatStore();
    store.append(makeMessage({ id: 'seated-msg', authorWasSeated: true }));
    store.append(makeMessage({ id: 'spectator-msg', authorWasSeated: false }));

    const seatedViewerHistory = store.historyFor('room-1', true);
    expect(seatedViewerHistory.map((m) => m.id)).toEqual(['seated-msg']);

    const spectatorViewerHistory = store.historyFor('room-1', false);
    expect(spectatorViewerHistory.map((m) => m.id)).toEqual(['seated-msg', 'spectator-msg']);
  });

  it('historyFor returns an empty array for a room with no messages', () => {
    const store = new ChatStore();
    expect(store.historyFor('room-unknown', true)).toEqual([]);
  });

  it('historyFor does not leak messages from a different room', () => {
    const store = new ChatStore();
    store.append(makeMessage({ id: 'other-room-msg', roomID: 'room-2', authorWasSeated: false }));

    expect(store.historyFor('room-1', false)).toEqual([]);
  });

  it('AC7: caps stored history at 200 messages per room, discarding the oldest first', () => {
    const store = new ChatStore();
    for (let i = 0; i < 250; i++) {
      store.append(makeMessage({ id: `msg-${i}`, authorWasSeated: true }));
    }

    const history = store.historyFor('room-1', true);
    expect(history).toHaveLength(200);
    expect(history[0]?.id).toBe('msg-50');
    expect(history[199]?.id).toBe('msg-249');
  });
});

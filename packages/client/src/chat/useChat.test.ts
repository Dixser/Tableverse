import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChat } from './useChat.js';
import type { ChatMessage } from './useChat.js';

interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
}

const { mockSocketInstances, ioMock } = vi.hoisted(() => {
  const instances: MockSocket[] = [];
  const mock = vi.fn(() => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const socket: MockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        (listeners[event] ??= []).push(cb);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      trigger: (event, ...args) => {
        for (const cb of listeners[event] ?? []) cb(...args);
      },
    };
    instances.push(socket);
    return socket;
  });
  return { mockSocketInstances: instances, ioMock: mock };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    roomID: 'room-1',
    authorUserID: 'user-1',
    authorDisplayName: 'Alice',
    authorWasSeated: true,
    body: 'hello',
    sentAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useChat', () => {
  afterEach(() => {
    mockSocketInstances.length = 0;
    vi.clearAllMocks();
  });

  it('does not connect when roomID or sessionToken is missing', () => {
    renderHook(() => useChat(null, 'tok'));
    renderHook(() => useChat('room-1', null));
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('sends hello with roomID and sessionToken once connected', () => {
    renderHook(() => useChat('room-1', 'tok'));
    const socket = mockSocketInstances[0]!;

    act(() => socket.trigger('connect'));

    expect(socket.emit).toHaveBeenCalledWith('hello', { roomID: 'room-1', sessionToken: 'tok' });
  });

  it('replaces local state with the chatHistory snapshot on join', () => {
    const { result } = renderHook(() => useChat('room-1', 'tok'));
    const socket = mockSocketInstances[0]!;
    const history = [makeMessage({ id: 'a' }), makeMessage({ id: 'b' })];

    act(() => socket.trigger('chatHistory', history));

    expect(result.current.messages).toEqual(history);
  });

  it('appends live chatMessage events after the initial history', () => {
    const { result } = renderHook(() => useChat('room-1', 'tok'));
    const socket = mockSocketInstances[0]!;

    act(() => socket.trigger('chatHistory', [makeMessage({ id: 'a' })]));
    act(() => socket.trigger('chatMessage', makeMessage({ id: 'b' })));

    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('sendMessage emits sendMessage with the current roomID and body', () => {
    const { result } = renderHook(() => useChat('room-1', 'tok'));
    const socket = mockSocketInstances[0]!;

    act(() => result.current.sendMessage('hi there'));

    expect(socket.emit).toHaveBeenCalledWith('sendMessage', {
      roomID: 'room-1',
      body: 'hi there',
    });
  });

  it('disconnects the socket and reconnects fresh when roomID changes', () => {
    const { rerender } = renderHook(({ roomID }) => useChat(roomID, 'tok'), {
      initialProps: { roomID: 'room-1' },
    });
    const firstSocket = mockSocketInstances[0]!;

    rerender({ roomID: 'room-2' });

    expect(firstSocket.disconnect).toHaveBeenCalled();
    expect(mockSocketInstances).toHaveLength(2);
  });
});

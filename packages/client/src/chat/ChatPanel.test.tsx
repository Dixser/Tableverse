// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatPanel, extractGameLogEntries } from './ChatPanel.js';
import type { ChatMessage } from './useChat.js';
import i18n from '../i18n/i18n.js';

const { mockUseChat } = vi.hoisted(() => ({ mockUseChat: vi.fn() }));
vi.mock('./useChat.js', () => ({ useChat: mockUseChat }));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    roomID: 'room-1',
    authorUserID: 'user-1',
    authorDisplayName: 'Alice',
    authorWasSeated: true,
    body: 'hello',
    sentAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('extractGameLogEntries', () => {
  it('returns an empty array when gameLog is undefined or not an array', () => {
    expect(extractGameLogEntries(undefined)).toEqual([]);
    expect(extractGameLogEntries(null)).toEqual([]);
    expect(extractGameLogEntries('not an array')).toEqual([]);
    expect(extractGameLogEntries({ key: 'not-wrapped-in-array' })).toEqual([]);
  });

  it('filters out malformed entries, keeping only well-formed ones unchanged', () => {
    const wellFormed = { key: 'loveLetter.log.eliminated', params: { name: 'Alice' } };
    const result = extractGameLogEntries([
      wellFormed,
      null,
      42,
      'a string',
      { params: { name: 'no key field' } },
      { key: 123 },
    ]);
    expect(result).toEqual([wellFormed]);
  });
});

describe('ChatPanel', () => {
  beforeAll(() => {
    i18n.addResource('en', 'translation', 'test.log.eliminated', '{{name}} was eliminated');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockUseChat.mockReset();
  });

  it('AC9: with no gameLog present, renders free-text messages only, with no error and no system rows', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ body: 'hi everyone' })],
      sendMessage: vi.fn(),
    });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(screen.getByText('hi everyone')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText(/was eliminated/)).not.toBeInTheDocument();
  });

  it('AC8: a well-formed gameLog entry renders as a translated system message, interleaved with chat entries', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2030-01-01T00:00:00.000Z').getTime());
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ body: 'earlier chat message', sentAt: '2020-01-01T00:00:00.000Z' })],
      sendMessage: vi.fn(),
    });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.eliminated', params: { name: 'Bob' } }]}
      />,
    );

    expect(screen.getByText('earlier chat message')).toBeInTheDocument();
    expect(screen.getByText('Bob was eliminated')).toBeInTheDocument();

    // The system row (observed "now") sorts after the older chat message.
    const rows = screen.getAllByRole('listitem');
    const chatIndex = rows.findIndex((r) => r.textContent?.includes('earlier chat message'));
    const logIndex = rows.findIndex((r) => r.textContent?.includes('Bob was eliminated'));
    expect(chatIndex).toBeLessThan(logIndex);
  });

  it('ignores malformed gameLog entries without crashing', () => {
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(<ChatPanel roomID="room-1" sessionToken="tok" gameLog={[{ noKey: true }, 42]} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('typing a message and submitting calls sendMessage with the trimmed body and clears the input', () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue({ messages: [], sendMessage });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);

    const input = screen.getByPlaceholderText(i18n.t('chat.inputPlaceholder')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello there  ' } });
    fireEvent.submit(screen.getByText(i18n.t('chat.send')).closest('form')!);

    expect(sendMessage).toHaveBeenCalledWith('hello there');
    expect(input.value).toBe('');
  });

  it('does not call sendMessage for an empty/whitespace-only body', () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue({ messages: [], sendMessage });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);

    fireEvent.submit(screen.getByText(i18n.t('chat.send')).closest('form')!);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

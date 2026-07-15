// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatPanel, extractGameLogEntries } from './ChatPanel.js';
import type { ChatMessage } from './useChat.js';
import i18n from '../i18n/i18n.js';
import styles from './ChatPanel.module.css';

const { mockUseChat } = vi.hoisted(() => ({ mockUseChat: vi.fn() }));
vi.mock('./useChat.js', () => ({ useChat: mockUseChat }));

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

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
    setViewportWidth(1024);
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

  it('marks an "eliminated" log entry with the elimination style, but not an ordinary log entry', () => {
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.eliminated', params: { name: 'Bob' } }]}
      />,
    );

    const row = screen.getByText('Bob was eliminated').closest('li')!;
    expect(row.className).toContain(styles.logRow);
    expect(row.className).toContain(styles.logRowElimination);
  });

  it('does not apply the elimination style to a non-eliminated log entry', () => {
    i18n.addResource('en', 'translation', 'test.log.cardPlayed', '{{name}} played a card');
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.cardPlayed', params: { name: 'Bob' } }]}
      />,
    );

    const row = screen.getByText('Bob played a card').closest('li')!;
    expect(row.className).toContain(styles.logRow);
    expect(row.className).not.toContain(styles.logRowElimination);
  });

  it('resolves a player-ID-shaped param (e.g. "actor") to the claimed seat name via playerNames', () => {
    i18n.addResource('en', 'translation', 'test.log.actorEvent', '{{actor}} did something');
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.actorEvent', params: { actor: '0' } }]}
        playerNames={{ '0': 'Alice' }}
      />,
    );

    expect(screen.getByText('Alice did something')).toBeInTheDocument();
  });

  it('falls back to the seat label for a player-ID param with no synced name yet', () => {
    i18n.addResource('en', 'translation', 'test.log.actorEvent', '{{actor}} did something');
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.actorEvent', params: { actor: '0' } }]}
      />,
    );

    expect(screen.getByText(`${i18n.t('room.seatLabel', { seatNumber: 1 })} did something`)).toBeInTheDocument();
  });

  it('leaves non-player-ID params (e.g. a card rank) untouched', () => {
    i18n.addResource('en', 'translation', 'test.log.cardRank', 'played rank {{card}}');
    mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() });

    render(
      <ChatPanel
        roomID="room-1"
        sessionToken="tok"
        gameLog={[{ key: 'test.log.cardRank', params: { card: 4 } }]}
        playerNames={{ '4': 'ShouldNotBeUsed' }}
      />,
    );

    expect(screen.getByText('played rank 4')).toBeInTheDocument();
  });

  it('scrolls the feed to the bottom on mount and when new entries arrive', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });
    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 500;
      },
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    const feed = screen.getByText('first').closest('ul')!;
    expect(feed.scrollTop).toBe(500);

    feed.scrollTop = 0;
    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(feed.scrollTop).toBe(500);
  });

  function makeScrolledUpFeed(feed: HTMLUListElement): void {
    Object.defineProperty(feed, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(feed, 'clientHeight', { value: 300, configurable: true });
    feed.scrollTop = 100; // 1000 - 100 - 300 = 600px from bottom, well past the threshold.
    fireEvent.scroll(feed);
  }

  it('does not auto-scroll and shows an unread indicator when a message arrives while scrolled up', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    const feed = screen.getByText('first').closest('ul')!;
    makeScrolledUpFeed(feed);

    expect(screen.queryByText(i18n.t('chat.newMessages', { count: 1 }))).not.toBeInTheDocument();

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(feed.scrollTop).toBe(100); // unchanged -- no auto-scroll while reading earlier messages.
    expect(screen.getByText(i18n.t('chat.newMessages', { count: 1 }))).toBeInTheDocument();
  });

  it('aggregates multiple new messages into a single indicator rather than stacking', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    const feed = screen.getByText('first').closest('ul')!;
    makeScrolledUpFeed(feed);

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
        makeMessage({ id: 'msg-3', body: 'third' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(screen.queryByText(i18n.t('chat.newMessages', { count: 1 }))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('chat.newMessages', { count: 2 }))).toBeInTheDocument();
  });

  it('clicking the unread indicator scrolls to the bottom and dismisses it', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    const feed = screen.getByText('first').closest('ul')!;
    makeScrolledUpFeed(feed);

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    fireEvent.click(screen.getByText(i18n.t('chat.newMessages', { count: 1 })));

    expect(feed.scrollTop).toBe(feed.scrollHeight);
    expect(screen.queryByText(i18n.t('chat.newMessages', { count: 1 }))).not.toBeInTheDocument();
  });

  it('clears the unread indicator when the reader scrolls back to the bottom themselves', () => {
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    const feed = screen.getByText('first').closest('ul')!;
    makeScrolledUpFeed(feed);

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);
    expect(screen.getByText(i18n.t('chat.newMessages', { count: 1 }))).toBeInTheDocument();

    // Reader scrolls back down to the bottom themselves (not via the CTA).
    feed.scrollTop = 700; // 1000 - 700 - 300 = 0px from bottom.
    fireEvent.scroll(feed);

    expect(screen.queryByText(i18n.t('chat.newMessages', { count: 1 }))).not.toBeInTheDocument();
  });

  it('starts collapsed to a pill on a mobile-width viewport, expands on click', () => {
    setViewportWidth(400);
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ body: 'hello' })],
      sendMessage: vi.fn(),
    });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);

    // Collapsed: only the pill (labeled with the chat title) is present,
    // not the feed/composer.
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    const pill = screen.getByRole('button', { name: i18n.t('chat.title') });

    fireEvent.click(pill);

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(i18n.t('chat.inputPlaceholder'))).toBeInTheDocument();
  });

  it('shows the unread count as a badge on the collapsed mobile pill', () => {
    setViewportWidth(400);
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ id: 'msg-1', body: 'first' })],
      sendMessage: vi.fn(),
    });

    const { rerender } = render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    mockUseChat.mockReturnValue({
      messages: [
        makeMessage({ id: 'msg-1', body: 'first' }),
        makeMessage({ id: 'msg-2', body: 'second' }),
      ],
      sendMessage: vi.fn(),
    });
    rerender(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('collapses back to the pill via the mobile collapse button', () => {
    setViewportWidth(400);
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ body: 'hello' })],
      sendMessage: vi.fn(),
    });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chat.title') }));
    expect(screen.getByText('hello')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('chat.collapse') }));

    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('chat.title') })).toBeInTheDocument();
  });

  it('renders the full panel (never collapsed) on a desktop-width viewport', () => {
    setViewportWidth(1280);
    mockUseChat.mockReturnValue({
      messages: [makeMessage({ body: 'hello' })],
      sendMessage: vi.fn(),
    });

    render(<ChatPanel roomID="room-1" sessionToken="tok" />);

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('chat.collapse') })).not.toBeInTheDocument();
  });
});

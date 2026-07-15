import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { GameLogEntry } from '@tableverse/game-core';
import { useChat, type ChatMessage } from './useChat.js';
import styles from './ChatPanel.module.css';

export interface ChatPanelProps {
  roomID: string;
  sessionToken: string;
  /** Raw G.log if present on the active match's G -- unknown, not
   * GameLogEntry[], since a non-conforming game's G shouldn't crash the
   * panel (same defensive posture as GameoverBanner's `gameover: unknown`). */
  gameLog?: unknown;
  /** playerID -> display name for the active match, same shape/source as
   * GameMount's own `playerNames` (App.tsx's `seatClients.playerNames`).
   * Used to resolve the player-identifying params (see PLAYER_ID_PARAM_KEYS
   * below) a game's G.log entries carry as raw seat IDs, e.g. "Player 0 is
   * out." -> "Player Alice is out.". */
  playerNames?: Record<string, string>;
}

/**
 * Param keys that hold a seat ID (or, for `winners`, a comma-joined list of
 * them) across every game's G.log entries -- see each game's gameDef.ts.
 * Every other param key (card, rank, level, ...) is a plain value rendered
 * as-is. Not derived from GameLogEntry itself since params carries no type
 * information; this is the platform-chrome equivalent of each game's own
 * playerLabel() helper, deliberately not imported from a specific game
 * module since ChatPanel renders every game's log entries generically.
 */
const PLAYER_ID_PARAM_KEYS = new Set(['actor', 'target', 'opponent', 'player', 'winners']);

function seatLabel(id: string, playerNames: Record<string, string> | undefined, t: TFunction): string {
  const seatFallback = t('room.seatLabel', { seatNumber: Number(id) + 1 });
  const name = playerNames?.[id];
  if (!name) return seatFallback;
  const sameNameCount = Object.values(playerNames ?? {}).filter((n) => n === name).length;
  return sameNameCount > 1 ? `${name} (${seatFallback})` : name;
}

function resolveLogParams(
  params: Record<string, string | number> | undefined,
  playerNames: Record<string, string> | undefined,
  t: TFunction,
): Record<string, string | number> | undefined {
  if (!params) return params;
  const resolved: Record<string, string | number> = { ...params };
  for (const key of Object.keys(params)) {
    if (!PLAYER_ID_PARAM_KEYS.has(key)) continue;
    const value = String(params[key]);
    resolved[key] = value
      .split(',')
      .map((id) => seatLabel(id, playerNames, t))
      .join(', ');
  }
  return resolved;
}

/**
 * Filters `gameLog` down to well-formed GameLogEntry values, tolerating an
 * absent/non-array field or malformed entries -- see
 * spec/features/012-chat/plan.md. Exported separately from the component so
 * every branch is unit-testable without mounting React.
 */
export function extractGameLogEntries(gameLog: unknown): GameLogEntry[] {
  if (!Array.isArray(gameLog)) return [];
  return gameLog.filter(
    (e): e is GameLogEntry =>
      typeof e === 'object' && e !== null && typeof (e as GameLogEntry).key === 'string',
  );
}

/** How close to the bottom (in px of unscrolled content below the
 * viewport) still counts as "at the bottom" for auto-scroll/unread
 * purposes -- a user doesn't have to be pixel-perfect at the very end. */
const NEAR_BOTTOM_THRESHOLD_PX = 48;

interface StampedLogEntry extends GameLogEntry {
  /** Client-local Date.now(), stamped the moment this entry is first
   * observed (new array index since the last render) -- see plan.md's
   * "Client: useChat hook" section for why this is only an approximate
   * sort position for a client that just connected/reconnected. */
  observedAt: number;
}

type FeedEntry =
  | { kind: 'chat'; timestamp: number; message: ChatMessage }
  | { kind: 'log'; timestamp: number; entry: StampedLogEntry };

/**
 * Platform chrome: one merged, time-ordered chat feed per room -- free-text
 * messages (via useChat) interleaved with a game's own G.log entries,
 * rendered as translated system rows. Never renders game-specific UI
 * itself. See spec/features/012-chat.
 */
export function ChatPanel({ roomID, sessionToken, gameLog, playerNames }: ChatPanelProps) {
  const { t } = useTranslation();
  const { messages, sendMessage } = useChat(roomID, sessionToken);
  const [body, setBody] = useState('');
  const [stampedLog, setStampedLog] = useState<StampedLogEntry[]>([]);
  const feedRef = useRef<HTMLUListElement>(null);
  // Read/written outside React's render cycle (scroll/resize handlers,
  // the pre-append check in the feed-growth effect below) -- doesn't need
  // to be state since nothing needs to re-render off its value alone.
  const isNearBottomRef = useRef(true);
  const prevFeedLengthRef = useRef(0);
  const hasMountedRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const logEntries = extractGameLogEntries(gameLog);
  useEffect(() => {
    setStampedLog((prev) => {
      if (logEntries.length <= prev.length) return prev;
      const newlyObserved = logEntries
        .slice(prev.length)
        .map((entry) => ({ ...entry, observedAt: Date.now() }));
      return [...prev, ...newlyObserved];
    });
    // Only the count of observed entries drives re-stamping -- entries
    // themselves are append-only per the GameLogEntry contract, so a
    // changed length is the only signal that matters.
  }, [logEntries.length]);

  const feed: FeedEntry[] = [
    ...messages.map((message): FeedEntry => ({
      kind: 'chat',
      timestamp: new Date(message.sentAt).getTime(),
      message,
    })),
    ...stampedLog.map((entry): FeedEntry => ({
      kind: 'log',
      timestamp: entry.observedAt,
      entry,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Keyed on the feed's length so this also runs on initial mount (the
  // panel should open already scrolled to the latest message, not the
  // oldest) as well as every time a new chat/log entry appends. Only
  // force-scrolls when the reader was already at (or near) the bottom --
  // otherwise a reader scrolled up to reread earlier messages would get
  // yanked back down by every incoming message, so this bumps the unread
  // counter instead and leaves their scroll position alone.
  useEffect(() => {
    const el = feedRef.current;
    const delta = feed.length - prevFeedLengthRef.current;
    prevFeedLengthRef.current = feed.length;
    if (!el) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (delta <= 0) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setUnreadCount((prev) => prev + delta);
    }
  }, [feed.length]);

  const updateNearBottom = () => {
    const el = feedRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setUnreadCount(0);
  };

  // A viewport resize (e.g. mobile rotation) can change whether the
  // current scroll position counts as "near the bottom" without firing a
  // scroll event at all.
  useEffect(() => {
    window.addEventListener('resize', updateNearBottom);
    return () => window.removeEventListener('resize', updateNearBottom);
  }, []);

  const scrollToBottom = () => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
    setUnreadCount(0);
  };

  return (
    <div className={styles.panel} aria-label={t('chat.title')}>
      <div className={styles.feedWrapper}>
        <ul className={styles.feed} ref={feedRef} onScroll={updateNearBottom}>
          {feed.map((item) =>
            item.kind === 'chat' ? (
              <li key={item.message.id} className={styles.chatRow}>
                <span className={styles.author}>{item.message.authorDisplayName}</span>
                <span>{item.message.body}</span>
              </li>
            ) : (
              <li
                key={`${item.entry.key}-${item.timestamp}`}
                className={
                  item.entry.key.endsWith('.eliminated')
                    ? `${styles.logRow} ${styles.logRowElimination}`
                    : styles.logRow
                }
              >
                {t(item.entry.key, resolveLogParams(item.entry.params, playerNames, t))}
              </li>
            ),
          )}
        </ul>
        {unreadCount > 0 && (
          <button
            type="button"
            className={styles.newMessagesCta}
            onClick={scrollToBottom}
          >
            {t('chat.newMessages', { count: unreadCount })}
          </button>
        )}
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = body.trim();
          if (!trimmed) return;
          sendMessage(trimmed);
          setBody('');
        }}
      >
        <input
          className={styles.input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('chat.inputPlaceholder')}
        />
        <button className={styles.sendButton} type="submit">
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}

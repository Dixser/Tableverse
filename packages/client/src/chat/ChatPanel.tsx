import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
export function ChatPanel({ roomID, sessionToken, gameLog }: ChatPanelProps) {
  const { t } = useTranslation();
  const { messages, sendMessage } = useChat(roomID, sessionToken);
  const [body, setBody] = useState('');
  const [stampedLog, setStampedLog] = useState<StampedLogEntry[]>([]);

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

  return (
    <div className={styles.panel} aria-label={t('chat.title')}>
      <ul className={styles.feed}>
        {feed.map((item) =>
          item.kind === 'chat' ? (
            <li key={item.message.id} className={styles.chatRow}>
              <span className={styles.author}>{item.message.authorDisplayName}</span>
              <span>{item.message.body}</span>
            </li>
          ) : (
            <li key={`${item.entry.key}-${item.timestamp}`} className={styles.logRow}>
              {t(item.entry.key, item.entry.params)}
            </li>
          ),
        )}
      </ul>
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

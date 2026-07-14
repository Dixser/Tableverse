import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLogEntry } from '../../types.js';
import styles from './PrivateRevealToast.module.css';

export interface PrivateRevealToastProps {
  /** view.privateReveals[playerID] -- empty for a spectator or a player with no pending reveal. */
  entries: GameLogEntry[];
}

/**
 * Renders every privateReveals entry seen so far for the active viewer,
 * accumulated locally (not re-derived from `entries` on every render) so a
 * round-boundary reset of G.privateReveals (gameDef.ts's dealNewRound)
 * doesn't make an already-shown reveal vanish mid-render -- same "diff by
 * array length" convention as ChatPanel's own stampedLog (feature 012) and
 * GameoverBanner's array-index de-dup.
 */
export function PrivateRevealToast({ entries }: PrivateRevealToastProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState<GameLogEntry[]>([]);

  useEffect(() => {
    setShown((prev) => {
      if (entries.length <= prev.length) return prev;
      return [...prev, ...entries.slice(prev.length)];
    });
    // Only the count of observed entries drives this -- entries themselves
    // are append-only per the GameLogEntry contract, so a changed length is
    // the only signal that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  if (shown.length === 0) return null;

  return (
    <div className={styles.toasts}>
      {shown.map((entry, index) => (
        <p key={index} className={styles.toast} role="status">
          {t(entry.key, entry.params)}
        </p>
      ))}
    </div>
  );
}

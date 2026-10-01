import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './PlayArea.module.css';

export interface PlayAreaProps {
  playedCards: Record<string, CardRank[]>;
  eliminated: Record<string, boolean>;
  handmaidProtected: Record<string, boolean>;
  /** Cumulative favor tokens per seat -- spec.md story 4 requires these
   * visible mid-round, so they're always rendered, not only at round end. */
  roundWins: Record<string, number>;
  /** Tokens needed to win the match -- each seat's remaining tokens are
   * drawn as empty slots. Omit to show only the tokens already won. */
  tokensToWin?: number;
  /** playerID -> username, for a real name instead of "Seat N" where known. */
  playerNames?: Record<string, string>;
  /** ctx.currentPlayer -- whose seat gets the active-turn highlight. */
  currentPlayerID?: string | null;
}

/** One favor token per round won -- shown as tokens rather than a bare number. */
const TOKEN = '🔴';
/** One empty slot per token still needed to win the match. */
const EMPTY_TOKEN = '〇';

/**
 * Every seat's discard pile, round wins, and elimination/protection status -- public
 * information, identical for every viewer (seated or spectator), always
 * visible. Never reads hands or privateReveals.
 */
export function PlayArea({
  playedCards,
  eliminated,
  handmaidProtected,
  roundWins,
  tokensToWin,
  playerNames,
  currentPlayerID,
}: PlayAreaProps) {
  const { t } = useTranslation();
  const seats = Object.keys(playedCards);
  return (
    <div className={styles.playArea} aria-label={t('loveLetter.playArea.title')}>
      {seats.map((seatID) => {
        const label = playerLabel(seatID, playerNames, t);
        const wins = roundWins[seatID] ?? 0;
        return (
          <div
            key={seatID}
            className={seatID === currentPlayerID ? `${styles.seat} ${styles.active}` : styles.seat}
          >
            <div className={styles.seatHeader}>
              <span className={styles.name}>{label}</span>
              {/* Numeric count lives on the aria-label so screen readers don't read out N emoji. */}
              <span
                className={styles.tokens}
                role="img"
                aria-label={t('loveLetter.roundWins.count', { name: label, count: wins })}
              >
                {TOKEN.repeat(wins) + EMPTY_TOKEN.repeat(Math.max(0, (tokensToWin ?? 0) - wins))}
              </span>
              {eliminated[seatID] && (
                <span className={styles.badge}>{t('loveLetter.playArea.eliminated')}</span>
              )}
              {handmaidProtected[seatID] && (
                <span className={styles.badge}>{t('loveLetter.playArea.protected')}</span>
              )}
            </div>
            <div className={styles.cards}>
              {playedCards[seatID]!.length === 0 && <span className={styles.empty}>{t('loveLetter.playArea.empty')}</span>}
              {playedCards[seatID]!.map((rank, index) => (
                <CardTile key={index} rank={rank} compact />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

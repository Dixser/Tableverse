import { useTranslation } from 'react-i18next';
import type { TrickPlay } from './trickResolution.js';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './TrickZone.module.css';

export interface TrickZoneProps {
  plays: TrickPlay[];
  /** Highlights the winning card -- only known once the trick is resolved (the frozen "last trick" view during trickConfirm). Undefined for a trick still in progress. */
  winnerSeatID?: string;
  winningCard?: Card;
  playerNames?: Record<string, string>;
}

/**
 * The trick currently being played, or (during the trickConfirm wait) the
 * just-resolved trick, kept visible so everyone can see what happened
 * before the next one starts -- see gameDef.ts's own doc comment on
 * `lastTrick`.
 */
export function TrickZone({ plays, winnerSeatID, winningCard, playerNames }: TrickZoneProps) {
  const { t } = useTranslation();
  if (plays.length === 0) {
    return <div className={styles.zone}>{t('crew.trick.empty')}</div>;
  }
  return (
    <div className={styles.zone}>
      <h3 className={styles.title}>
        {winnerSeatID ? t('crew.trick.resolvedTitle') : t('crew.trick.inProgressTitle')}
      </h3>
      <div className={styles.plays}>
        {plays.map((play) => (
          <div key={play.seatID} className={styles.play}>
            <span className={styles.playerName}>{playerLabel(play.seatID, playerNames, t)}</span>
            <CardTile card={play.card} compact selected={winningCard?.id === play.card.id} />
          </div>
        ))}
      </div>
      {winnerSeatID && (
        <p className={styles.winner}>{t('crew.trick.winner', { name: playerLabel(winnerSeatID, playerNames, t) })}</p>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { TrickPlay } from './trickResolution.js';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './TrickZone.module.css';

export interface TrickZoneProps {
  /** Every seated player, in turn order -- rendered as one row each, mirrors regicide's PlayerStatusList. */
  activeSeatIDs: string[];
  plays: TrickPlay[];
  /** Highlights the winning card -- only known once the trick is resolved (the frozen "last trick" view during trickConfirm). Undefined for a trick still in progress. */
  winnerSeatID?: string;
  winningCard?: Card;
  playerNames?: Record<string, string>;
  playerID?: string | null;
  /** ctx.currentPlayer -- whose turn it is to play into this trick next. Ignored once the trick is resolved (winnerSeatID set), since there's no "next to play" for a frozen trick. */
  currentPlayerID?: string | null;
}

/**
 * The trick currently being played, or (during the trickConfirm wait) the
 * just-resolved trick, kept visible so everyone can see what happened
 * before the next one starts -- see gameDef.ts's own doc comment on
 * `lastTrick`. One row per seated player (mirrors regicide's
 * PlayerStatusList: a vertical column of rows, played card to the right
 * of the name), so seats who haven't played into this trick yet still
 * show a slot -- and whoever's up next is color-highlighted, same as the
 * active-turn treatment there.
 */
export function TrickZone({
  activeSeatIDs,
  plays,
  winnerSeatID,
  winningCard,
  playerNames,
  playerID,
  currentPlayerID,
}: TrickZoneProps) {
  const { t } = useTranslation();
  const playsBySeat = new Map(plays.map((play) => [play.seatID, play.card]));
  return (
    <div className={styles.zone}>
      <h3 className={styles.title}>
        {winnerSeatID ? t('crew.trick.resolvedTitle') : t('crew.trick.inProgressTitle')}
      </h3>
      <ul className={styles.plays}>
        {activeSeatIDs.map((seatID) => {
          const card = playsBySeat.get(seatID);
          const isActiveTurn = !winnerSeatID && seatID === currentPlayerID;
          const className = [seatID === playerID ? styles.self : null, isActiveTurn ? styles.active : null]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={seatID} className={className || undefined}>
              <span className={styles.playerName}>{playerLabel(seatID, playerNames, t)}</span>
              {card ? (
                <CardTile card={card} compact selected={winningCard?.id === card.id} />
              ) : (
                <span className={styles.cardEmpty} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
      {winnerSeatID && (
        <p className={styles.winner}>{t('crew.trick.winner', { name: playerLabel(winnerSeatID, playerNames, t) })}</p>
      )}
    </div>
  );
}

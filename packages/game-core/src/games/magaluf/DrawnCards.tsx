import { useTranslation } from 'react-i18next';
import { ALCOHOL } from './cards.js';
import type { LastDraw } from './state.js';
import { CardTile } from './CardTile.js';
import styles from './DrawnCards.module.css';

export interface DrawnCardsProps {
  lastDraw: LastDraw | null;
  drawerName: string | null;
}

/**
 * What the deck just did to somebody.
 *
 * Reads `G.lastDraw` rather than the log tail: a Ronda appends one entry per
 * player and a Chupito de la casa chains a second for the same seat, so the
 * last log entry is not reliably the draw that caused them.
 */
export function DrawnCards({ lastDraw, drawerName }: DrawnCardsProps) {
  const { t } = useTranslation();
  if (!lastDraw) {
    return (
      <div className={styles.empty} data-testid="drawn-empty">
        {t('magaluf.board.nothingDrawn')}
      </div>
    );
  }

  const card = ALCOHOL[lastDraw.alcohol];

  return (
    <div className={styles.drawn} data-testid="drawn-cards">
      <span className={styles.caption}>
        {t('magaluf.board.drewCaption', { name: drawerName ?? '' })}
      </span>
      <div className={styles.cards}>
        {card && <CardTile kind="alcohol" id={card.id} intox={card.intox} vp={card.vp} />}
        {lastDraw.event && <CardTile kind="event" id={lastDraw.event} />}
      </div>
    </div>
  );
}

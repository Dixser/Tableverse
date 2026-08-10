import { useTranslation } from 'react-i18next';
import { ALCOHOL } from './cards.js';
import type { LastDraw } from './state.js';
import { CardTile } from './CardTile.js';
import styles from './DrawnCards.module.css';

export interface DrawnCardsProps {
  lastDraw: LastDraw | null;
  drawerName: string | null;
  /** True while an event card has been drawn but not yet turned over. */
  eventPending: boolean;
  /**
   * Turns a seat ID into a display name. Passed in rather than looked up here
   * because only the board knows the room's `playerNames` -- same reason the
   * chat feed resolves the identical params itself.
   */
  nameFor: (seatID: string) => string;
}

/**
 * Param keys on an outcome that carry a seat ID. Kept in step with
 * ChatPanel's PLAYER_ID_PARAM_KEYS: the same outcome renders in both places
 * and must read the same way in each.
 */
const PLAYER_PARAM_KEYS = ['actor', 'winners'] as const;

/**
 * What the deck just did to somebody.
 *
 * Reads `G.lastDraw` rather than the log tail: a Ronda appends one entry per
 * player and a Chupito de la casa chains a second for the same seat, so the
 * last log entry is not reliably the draw that caused them.
 */
export function DrawnCards({ lastDraw, drawerName, eventPending, nameFor }: DrawnCardsProps) {
  const { t } = useTranslation();

  /**
   * The worked-out result, as one sentence.
   *
   * `ranking` is deliberately dropped here: the full leaderboard belongs in
   * the feed, where it can be scrolled back to. On the card it would push the
   * one number the drawer actually wants off the tile.
   */
  const outcomeText = (() => {
    const outcome = lastDraw?.outcome;
    if (!outcome) return null;
    const params: Record<string, string | number> = { ...outcome.params };
    for (const key of PLAYER_PARAM_KEYS) {
      const raw = params[key];
      if (raw === undefined) continue;
      params[key] = String(raw).split(',').map(nameFor).join(', ');
    }
    return t(outcome.key, params);
  })();

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
        {lastDraw.event ? (
          <CardTile kind="event" id={lastDraw.event} />
        ) : (
          // Face-down, so the table can see an event is coming before it lands.
          eventPending && (
            <div className={styles.facedown} data-testid="event-facedown">
              {t('magaluf.board.eventFaceDown')}
            </div>
          )
        )}
      </div>
      {outcomeText && (
        <span className={styles.outcome} data-testid="event-outcome">
          {outcomeText}
        </span>
      )}
    </div>
  );
}

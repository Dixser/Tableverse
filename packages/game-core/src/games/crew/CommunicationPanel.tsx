import { useTranslation } from 'react-i18next';
import type { Card } from './deck.js';
import { isHighestOfSuit, isLowestOfSuit, isOnlyOfSuit } from './communication.js';
import type { CommunicationPosition } from './gameDef.js';
import { CardTile } from './CardTile.js';
import styles from './CommunicationPanel.module.css';

export interface CommunicationPanelProps {
  hand: Card[];
  used: boolean;
  onCommunicate: (cardId: string, position: CommunicationPosition) => void;
  /** Set (to the trick number communication resumes at) while this mission's Disruption is still blocking communicateCard entirely -- rendered instead of the picker, regardless of `used`. */
  disruptedUntilTrick?: number;
  /** True on a Dead Zone mission -- the picker itself is unchanged (still must be a truthful highest/only/lowest claim), but a note explains that teammates won't be told which claim was made. */
  deadZone?: boolean;
}

const POSITIONS: CommunicationPosition[] = ['highest', 'only', 'lowest'];

/**
 * The once-per-mission radio communication token: pick one non-rocket
 * card and claim it's the highest, only, or lowest of its suit in hand --
 * only whichever claims are actually truthful are offered (rulebook: a
 * card that's neither the highest, only, nor lowest of its suit can't be
 * communicated at all). A card eligible for more than one truthful claim
 * (e.g. its suit's only card is simultaneously highest/only/lowest) lets
 * the player choose which to make, since which one is chosen carries
 * different information to the rest of the crew (rulebook's own tip: with
 * just an 8 and 9 of a suit, communicating the 8 as "lowest" reveals more
 * than communicating the 9 as "highest").
 */
export function CommunicationPanel({ hand, used, onCommunicate, disruptedUntilTrick, deadZone }: CommunicationPanelProps) {
  const { t } = useTranslation();
  if (disruptedUntilTrick !== undefined) {
    return (
      <div className={styles.panel}>{t('crew.communication.disrupted', { trick: disruptedUntilTrick })}</div>
    );
  }
  if (used) {
    return <div className={styles.panel}>{t('crew.communication.used')}</div>;
  }
  const checkers: Record<CommunicationPosition, (h: Card[], c: Card) => boolean> = {
    highest: isHighestOfSuit,
    only: isOnlyOfSuit,
    lowest: isLowestOfSuit,
  };
  const eligible = hand
    .filter((c) => c.suit !== 'rocket')
    .map((card) => ({ card, positions: POSITIONS.filter((p) => checkers[p](hand, card)) }))
    .filter(({ positions }) => positions.length > 0);

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>{t('crew.communication.title')}</h3>
      {deadZone && <p className={styles.none}>{t('crew.communication.deadZoneNote')}</p>}
      <div className={styles.communicationPanelContainer}>
        {eligible.length === 0 ? (
          <p className={styles.none}>{t('crew.communication.none')}</p>
        ) :

          (
            eligible.map(({ card, positions }) => (
              <div key={card.id} className={styles.row}>
                <CardTile card={card} compact />
                {positions.map((position) => (
                  <button key={position} type="button" onClick={() => onCommunicate(card.id, position)}>
                    {t(`crew.communication.position.${position}`)}
                  </button>
                ))}
              </div>
            ))
          )}
      </div>
    </div>
  );
}

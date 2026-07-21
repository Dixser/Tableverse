import { useTranslation } from 'react-i18next';
import type { CommunicationState } from './gameDef.js';
import { parseCardId } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './CommunicatedCards.module.css';

export interface CommunicatedCardsProps {
  activeSeatIDs: string[];
  communications: Record<string, CommunicationState>;
  playerNames?: Record<string, string>;
}

/**
 * The public "table" of currently communicated cards -- rulebook: a
 * communicated card is placed face up in front of its owner so every crew
 * member can see it, and it stays there until played. `G.communications`
 * is a fully public field, but until now nothing rendered it anywhere
 * except a faint dim on the OWNER's own hand (HandView's
 * `communicatedCardID`) -- invisible to every other seat, and gone from
 * the owner's own view too the moment they're not looking at their hand.
 * This renders every active seat's currently-visible communicated card
 * (if any), reconstructing the `Card` from its id alone (`parseCardId`)
 * rather than reading `hands`, since a viewer's own `G.hands` only ever
 * contains their OWN hand -- the id itself already carries the suit/rank
 * a spectator or teammate needs to render it. Seats with nothing
 * currently communicated (never used their token, or already played the
 * communicated card) are simply omitted; the whole component renders
 * nothing once no seat has anything to show.
 *
 * On a Dead Zone mission, `playerView` nulls out `position` for every
 * viewer except the seat that made the claim (see gameDef.ts's own doc
 * comment on that filtering) -- the card itself still shows here (it's
 * still placed face up, exactly as normal), just without the highest/
 * only/lowest label, matching the rulebook's "flip the token to its red
 * side instead of placing it on the card" Dead Zone rule.
 */
export function CommunicatedCards({ activeSeatIDs, communications, playerNames }: CommunicatedCardsProps) {
  const { t } = useTranslation();
  const visible = activeSeatIDs
    .map((seatID) => ({ seatID, comm: communications[seatID] }))
    .filter((entry): entry is { seatID: string; comm: CommunicationState & { cardId: string } } =>
      entry.comm?.cardId != null,
    );

  if (visible.length === 0) return null;

  return (
    <div className={styles.board}>
      <h3 className={styles.title}>{t('crew.communicatedCards.title')}</h3>
      <ul className={styles.list}>
        {visible.map(({ seatID, comm }) => (
          <li key={seatID} className={styles.entry}>
            <span className={styles.name}>{playerLabel(seatID, playerNames, t)}</span>
            <CardTile card={parseCardId(comm.cardId)} compact />
            <span className={styles.position}>
              {comm.position ? t(`crew.communication.position.${comm.position}`) : t('crew.communicatedCards.deadZoneHidden')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

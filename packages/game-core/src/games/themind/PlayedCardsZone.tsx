import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './PlayedCardsZone.module.css';

export interface PlayedCardsZoneProps {
  /** This level's shared pile, in the order played. */
  playedCards: number[];
  activeSeatIDs: string[];
  /** Per owning seat -- cards revealed by a misplay this level. */
  setAsideCards: Record<string, number[]>;
  /** Per owning seat -- cards revealed by a resolved shuriken this level. */
  starDiscards: Record<string, number[]>;
  playerNames?: Record<string, string>;
}

interface PerSeatRevealSectionProps {
  title: string;
  activeSeatIDs: string[];
  cardsBySeat: Record<string, number[]>;
  playerNames?: Record<string, string>;
  cardClassName: string | undefined;
}

/**
 * A revealed-cards zone attributed to the specific seat each card came
 * from -- NOT a pooled, anonymous list. Knowing whose card was revealed is
 * the actual point: for a shuriken, it's the entire reason to play one
 * (learning each teammate's current lowest card, not just thinning hands);
 * for a mistake, it mirrors the rulebook's own worked example ("Tim places
 * his 26 aside, Linus does the same with his 30").
 */
function PerSeatRevealSection({
  title,
  activeSeatIDs,
  cardsBySeat,
  playerNames,
  cardClassName,
}: PerSeatRevealSectionProps) {
  const { t } = useTranslation();
  const seatsWithReveals = activeSeatIDs.filter((id) => (cardsBySeat[id]?.length ?? 0) > 0);
  if (seatsWithReveals.length === 0) return null;
  return (
    <div className={styles.pile}>
      <p>{title}</p>
      <div className={styles.perPlayer} aria-label={title}>
        {seatsWithReveals.map((seatID) => (
          <div key={seatID} className={styles.playerRow}>
            <span className={styles.playerName}>{playerLabel(seatID, playerNames, t)}</span>
            <div className={styles.cards}>
              {cardsBySeat[seatID]!.map((card, index) => (
                <span key={index} className={cardClassName}>
                  {card}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Every public card zone for the CURRENT level -- spec.md story 2. Reset
 * every time a new level deals (gameDef.ts's dealLevel), so this only ever
 * shows the current level's own history, never past levels'.
 */
export function PlayedCardsZone({
  playedCards,
  activeSeatIDs,
  setAsideCards,
  starDiscards,
  playerNames,
}: PlayedCardsZoneProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.zone}>
      <div className={styles.pile}>
        <p>{t('theMind.playedCards.title')}</p>
        <div className={styles.cards} aria-label={t('theMind.playedCards.title')}>
          {playedCards.length === 0 && (
            <span className={styles.placeholder}>{t('theMind.playedCards.empty')}</span>
          )}
          {playedCards.map((card, index) => (
            <span key={index} className={styles.card}>
              {card}
            </span>
          ))}
        </div>
      </div>
      <PerSeatRevealSection
        title={t('theMind.setAsideCards.title')}
        activeSeatIDs={activeSeatIDs}
        cardsBySeat={setAsideCards}
        playerNames={playerNames}
        cardClassName={styles.cardMistake}
      />
      <PerSeatRevealSection
        title={t('theMind.starDiscards.title')}
        activeSeatIDs={activeSeatIDs}
        cardsBySeat={starDiscards}
        playerNames={playerNames}
        cardClassName={styles.cardStar}
      />
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import styles from './PlayedCardsZone.module.css';

export interface PlayedCardsZoneProps {
  /** This level's shared pile, in the order played. */
  playedCards: number[];
  /** Cards revealed by a misplay this level. */
  setAsideCards: number[];
  /** Cards revealed by a resolved shuriken this level. */
  starDiscards: number[];
}

/**
 * Every public card zone for the CURRENT level -- spec.md story 2. Reset
 * every time a new level deals (gameDef.ts's dealLevel), so this only ever
 * shows the current level's own history, never past levels'.
 */
export function PlayedCardsZone({ playedCards, setAsideCards, starDiscards }: PlayedCardsZoneProps) {
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
      {setAsideCards.length > 0 && (
        <div className={styles.pile}>
          <p>{t('theMind.setAsideCards.title')}</p>
          <div className={styles.cards} aria-label={t('theMind.setAsideCards.title')}>
            {setAsideCards.map((card, index) => (
              <span key={index} className={styles.cardMistake}>
                {card}
              </span>
            ))}
          </div>
        </div>
      )}
      {starDiscards.length > 0 && (
        <div className={styles.pile}>
          <p>{t('theMind.starDiscards.title')}</p>
          <div className={styles.cards} aria-label={t('theMind.starDiscards.title')}>
            {starDiscards.map((card, index) => (
              <span key={index} className={styles.cardStar}>
                {card}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

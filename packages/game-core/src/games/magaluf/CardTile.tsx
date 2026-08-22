import { useTranslation } from 'react-i18next';
import styles from './CardTile.module.css';

export interface CardTileProps {
  kind: 'alcohol' | 'event';
  /** Card id; the display name is `magaluf.<kind>.<id>.title`. */
  id: string;
  /** Alcohol only — the numbers actually applied, after any halving. */
  intox?: number;
  vp?: number;
}

/**
 * The compact form of a card: its title and the numbers a seat actually took.
 *
 * `GameCard` is the full printed object — title, picture, effect, flavour —
 * and is what the drawn pair get. This stays for the knock-on drinks a Ronda
 * pours, where the point is *who took what* rather than what the card is: ten
 * seats at a ten-seat table would otherwise deal ten pieces of artwork
 * underneath the one card that caused them.
 */
export function CardTile({ kind, id, intox, vp }: CardTileProps) {
  const { t } = useTranslation();
  return (
    <div className={kind === 'alcohol' ? styles.alcohol : styles.event} data-testid={`card-${id}`}>
      <span className={styles.name}>{t(`magaluf.${kind}.${id}.title`)}</span>
      {intox !== undefined && vp !== undefined && (
        <span className={styles.numbers}>
          {/* Coloured by what the number does to you, not by its sign: more
              intoxication is the thing that kills you, less is relief. Agua is
              the only card in the deck that goes the good way. */}
          <span className={intox > 0 ? styles.intoxUp : styles.intoxDown}>
            {t('magaluf.board.intoxShort', { n: intox })}
          </span>
          <span className={styles.vp}>{t('magaluf.board.vpShort', { n: vp })}</span>
        </span>
      )}
    </div>
  );
}

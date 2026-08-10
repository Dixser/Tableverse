import { useTranslation } from 'react-i18next';
import styles from './CardTile.module.css';

export interface CardTileProps {
  kind: 'alcohol' | 'event';
  /** Card id; the display name is `magaluf.<kind>.<id>`. */
  id: string;
  /** Alcohol only — the numbers actually applied, after any halving. */
  intox?: number;
  vp?: number;
}

/**
 * A typographic placeholder for one card, matching this codebase's convention
 * of never shipping artwork (Love Letter, Regicide, Crew, Cahoots all do the
 * same). A per-game copy on purpose: every game here owns its own card atom
 * rather than sharing one.
 */
export function CardTile({ kind, id, intox, vp }: CardTileProps) {
  const { t } = useTranslation();
  return (
    <div className={kind === 'alcohol' ? styles.alcohol : styles.event} data-testid={`card-${id}`}>
      <span className={styles.name}>{t(`magaluf.${kind}.${id}`)}</span>
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

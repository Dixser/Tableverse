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
          <span className={styles.intox}>{t('magaluf.board.intoxShort', { n: intox })}</span>
          <span className={styles.vp}>{t('magaluf.board.vpShort', { n: vp })}</span>
        </span>
      )}
    </div>
  );
}

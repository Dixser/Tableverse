import styles from './DeckStack.module.css';

/**
 * Background-layer count for a given deck size -- purely a visual depth
 * cue (the deck's remaining order is real hidden information, never
 * shown). Same three-step model as Regicide/Cahoots' own DeckStack, tuned
 * to Love Letter's small deck (21 cards, fewer once a round is dealt).
 */
function stackLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 10) return 2;
  return 3;
}

export interface DeckStackProps {
  count: number;
  /** Full accessible text (e.g. "Cards left in deck: 7") -- the count is
   * also shown visually on the stack's front card, so this doubles as the
   * aria-label and a hover title. */
  ariaLabel: string;
}

/**
 * The face-down draw deck rendered as a card stack: the front card always
 * shows the exact count, with 0-3 darker layers behind it giving an
 * at-a-glance "thin" vs. "thick" read. Mirrors Regicide's DeckStack.
 */
export function DeckStack({ count, ariaLabel }: DeckStackProps) {
  const layers = stackLayers(count);
  const layerClasses = [styles.layer1, styles.layer2, styles.layer3].slice(0, layers);

  return (
    <div className={styles.stack} aria-label={ariaLabel} title={ariaLabel}>
      {layerClasses.map((layerClass, index) => (
        <div key={index} className={layerClass} aria-hidden="true" />
      ))}
      <div className={count === 0 ? `${styles.top} ${styles.empty}` : styles.top} aria-hidden="true">
        <span className={styles.count}>{count}</span>
      </div>
    </div>
  );
}

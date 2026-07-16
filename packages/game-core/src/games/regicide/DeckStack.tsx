import styles from './DeckStack.module.css';

/**
 * Background-layer count for a given pile size -- purely a visual depth
 * cue (no card data involved; Tavern/discard contents are never shown,
 * only their size). Thresholds are arbitrary but monotonic: an empty
 * pile reads as an empty slot, and the stack visibly thickens in three
 * steps as it grows, rather than a single fixed silhouette regardless of
 * whether it holds 1 card or 40.
 */
function stackLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 10) return 1;
  if (count < 20) return 2;
  return 3;
}

export interface DeckStackProps {
  count: number;
  /** Full accessible text (e.g. "Tavern deck: 26") -- the count is also
   * shown visually on the stack's front card, so this doubles as the
   * aria-label and a hover title. */
  ariaLabel: string;
}

/**
 * A pile rendered as a card stack: the front card always shows the exact
 * count, and 0-3 dimmed background layers behind it (see stackLayers)
 * give an at-a-glance sense of "thin" vs. "thick" without requiring the
 * viewer to read the number. Used for the Tavern deck and discard pile,
 * both of which only ever expose a count, never contents (spec.md
 * Non-goals).
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

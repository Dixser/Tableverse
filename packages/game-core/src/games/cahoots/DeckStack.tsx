import styles from './DeckStack.module.css';

/**
 * Background-layer count for a given pile size -- purely a visual depth
 * cue (no card data involved; the goal deck's remaining order is real
 * hidden information, never shown). Same three-step thresholds as
 * Regicide's own DeckStack (this component's model) -- thresholds are
 * arbitrary but monotonic, just tuned to a goal deck's much smaller
 * range (at most ~20 cards, vs. Regicide's 40-card Tavern deck).
 */
function stackLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 10) return 2;
  return 3;
}

/** One entry per `--deck-color` override in DeckStack.module.css -- goal deck and draw pile, Cahoots' own two decks. */
export type DeckStackVariant = 'goal' | 'draw';

const VARIANT_CLASS: Record<DeckStackVariant, string | undefined> = {
  goal: styles.goal,
  draw: styles.draw,
};

export interface DeckStackProps {
  count: number;
  /** Full accessible text (e.g. "Goal deck: 8 remaining") -- the count is
   * also shown visually on the stack's front card, so this doubles as the
   * aria-label and a hover title. */
  ariaLabel: string;
  /** Selects this stack's own --deck-color override (DeckStack.module.css) so the goal deck and draw pile read as visually distinct, even sitting near each other. */
  variant: DeckStackVariant;
}

/**
 * A face-down remainder, rendered as a card stack -- same model as
 * Regicide's own decks: the front card always shows the exact count, with
 * 0-2 dimmed background layers behind it giving an at-a-glance "thin" vs.
 * "thick" read. The goal variant deliberately excludes the 4 currently-
 * revealed `activeGoals` (GoalBoard renders those as their own GoalCards,
 * same as Regicide's currently-faced enemy is rendered separately from its
 * own Castle deck count).
 */
export function DeckStack({ count, ariaLabel, variant }: DeckStackProps) {
  const layers = stackLayers(count);
  const layerClasses = [styles.layer1, styles.layer2, styles.layer3].slice(0, layers);
  const stackClassName = [styles.stack, VARIANT_CLASS[variant]].filter(Boolean).join(' ');

  return (
    <div className={stackClassName} aria-label={ariaLabel} title={ariaLabel}>
      {layerClasses.map((layerClass, index) => (
        <div key={index} className={layerClass} aria-hidden="true" />
      ))}
      <div className={count === 0 ? `${styles.top} ${styles.empty}` : styles.top} aria-hidden="true">
        <span className={styles.count}>{count}</span>
      </div>
    </div>
  );
}

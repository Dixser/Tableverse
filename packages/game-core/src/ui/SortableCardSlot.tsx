import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './SortableCardSlot.module.css';

export interface SortableCardSlotProps {
  /**
   * The card's own stable id. Doubles as the sortable item id and -- in
   * Cahoots, whose DndContext also handles playing -- as the id `onDragEnd`
   * resolves back to a Card.
   */
  id: string;
  children: React.ReactNode;
  /**
   * `true`  -- a separate, always-enabled grip is the ONLY drag activator.
   *            Required wherever the card itself is a real <button> carrying
   *            its own click/Enter meaning (Regicide selects, Crew plays):
   *            those tiles render `disabled={disabled || !onClick}`, so they
   *            are natively disabled exactly when it isn't your turn -- and a
   *            disabled control dispatches no pointer events at all, which
   *            would make the card undraggable precisely when a player most
   *            wants to tidy their hand. The grip also sidesteps
   *            KeyboardSensor's Space/Enter colliding with the button's own.
   * `false` -- the whole slot is the activator (Cahoots, whose CardTile is an
   *            inert <div> with no click semantics, and whose drag must also
   *            be able to land on a pile).
   */
  handle: boolean;
  /** Accessible name for the grip (handle) or for the slot itself (no handle). */
  dragLabel: string;
  className?: string;
}

/**
 * The shared drag wrapper for a card in a hand (feature 031).
 *
 * Feature 029 deliberately declined to build this, on the rule that a shared
 * abstraction is extracted from two real consumers rather than designed ahead
 * of the first. This feature is the second and third consumer, so the shape is
 * observed rather than guessed. Note what is and isn't shared: this component
 * is behavioural (sensor plumbing, transforms, drag a11y), while each game's
 * `CardTile` -- the presentational part -- stays firmly per-game.
 *
 * `useSortable` is never passed `disabled`. Rearranging your own hand is
 * cosmetic and must work on someone else's turn; that is the entire point of
 * the feature (spec.md AC on always-available reordering).
 */
export function SortableCardSlot({ id, children, handle, dragLabel, className }: SortableCardSlotProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const classNames = [styles.slot, isDragging ? styles.dragging : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classNames}
      {...(handle ? {} : { ...listeners, ...attributes, 'aria-label': dragLabel })}
    >
      {children}
      {handle && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.handle}
          aria-label={dragLabel}
          {...listeners}
          {...attributes}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
    </div>
  );
}

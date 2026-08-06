import { useTranslation } from 'react-i18next';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { Card } from './deck.js';
import { CardTile, cardLabel } from './CardTile.js';
import { SortableCardSlot } from '../../ui/SortableCardSlot.js';
import { HandSortControls, type HandSortPreset } from '../../ui/HandSortControls.js';
import { byColorThenNumber, byNumberThenColor } from './handSort.js';
import styles from './HandView.module.css';

const SORT_PRESETS: HandSortPreset<Card>[] = [
  { id: 'color', labelKey: 'handSort.byColor', comparator: byColorThenNumber },
  { id: 'number', labelKey: 'handSort.byNumber', comparator: byNumberThenColor },
];

export interface HandViewProps {
  /** Already in the player's chosen order -- see BoardComponent's useHandOrder. */
  hand: Card[];
  /**
   * Whether playing a card is possible right now (this seat's turn).
   *
   * Since feature 031 this NO LONGER gates draggability: a card is always
   * draggable, because dragging it onto another hand card rearranges the hand,
   * which must work on someone else's turn. What `interactive` still conveys
   * is whether a drag can end in an actual move -- BoardComponent's onDragEnd
   * is the one place that decides, and PileZone's highlighting keys off the
   * same flag via `draggedCard`.
   */
  interactive: boolean;
  /** feature 031: hand-order actions, straight from useHandOrder. */
  itemIds: string[];
  onSort: (comparator: (a: Card, b: Card) => number) => void;
  onResetOrder: () => void;
  isCustomised: boolean;
}

/**
 * The acting player's own hand -- each card is draggable directly onto a
 * pile (see BoardComponent's DndContext), replacing the click-to-select
 * pattern every earlier game in this codebase uses (feature 029 is the
 * first real @dnd-kit consumer).
 *
 * Unlike Regicide's and Crew's hands, the whole card is the drag activator
 * (`handle={false}`): this game's CardTile is an inert <div> with no click
 * semantics to collide with, and the drag has to be able to land on a pile,
 * not just on a neighbouring card. There is no DndContext here either -- the
 * board owns the single one, because it also covers the piles.
 */
export function HandView({ hand, interactive, itemIds, onSort, onResetOrder, isCustomised }: HandViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className={styles.hand} role="group" aria-label={t('cahoots.hand.ariaLabel')}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {hand.map((card) => (
            <SortableCardSlot
              key={card.id}
              id={card.id}
              handle={false}
              dragLabel={t('handSort.dragHandleAriaLabel', { card: cardLabel(card, t) })}
              className={interactive ? styles.playable : undefined}
            >
              <CardTile card={card} />
            </SortableCardSlot>
          ))}
        </SortableContext>
      </div>
      <HandSortControls
        presets={SORT_PRESETS}
        onSort={onSort}
        onReset={onResetOrder}
        isCustomised={isCustomised}
        cardCount={hand.length}
      />
    </>
  );
}

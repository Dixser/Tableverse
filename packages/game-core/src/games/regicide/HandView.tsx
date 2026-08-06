import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { isLegalSelection } from './legalPlay.js';
import type { Card } from './deck.js';
import { CardTile, cardLabel } from './CardTile.js';
import { SortableCardSlot } from '../../ui/SortableCardSlot.js';
import { HandSortControls, type HandSortPreset } from '../../ui/HandSortControls.js';
import { useHandSortSensors } from '../../ui/useHandSortSensors.js';
import { handSortAccessibility } from '../../ui/handSortA11y.js';
import { bySuitThenRank, byRankThenSuit } from './handSort.js';
import styles from './HandView.module.css';

const SORT_PRESETS: HandSortPreset<Card>[] = [
  { id: 'suit', labelKey: 'handSort.bySuit', comparator: bySuitThenRank },
  { id: 'rank', labelKey: 'handSort.byRank', comparator: byRankThenSuit },
];

export interface HandViewProps {
  /** Already in the player's chosen order -- see BoardComponent's useHandOrder. */
  hand: Card[];
  /** The player's own in-progress selection (never written to G -- see
   * BoardComponent's own draft state doc comment). */
  selectedCardIds: string[];
  /** False outside the acting player's own turn, or while a picker
   * (Jester next-player) is already open. Gates PLAYING only -- rearranging
   * the hand stays available regardless (feature 031). */
  interactive: boolean;
  onCardClicked: (cardID: string) => void;
  /** feature 031: hand-order actions, straight from useHandOrder. */
  itemIds: string[];
  onReorder: (activeId: string, overId: string) => void;
  onSort: (comparator: (a: Card, b: Card) => number) => void;
  onResetOrder: () => void;
  isCustomised: boolean;
}

/**
 * The acting player's own hand -- toggle-select multiple cards into a
 * combo before Play is pressed (spec.md story 1). A card already part of
 * the selection can always be clicked again to deselect it; every other
 * card is disabled (with a reason) the instant adding it would make the
 * selection illegal, computed via feature 022's own `isLegalSelection`
 * rather than a locally reimplemented legality check (spec.md AC1-3).
 *
 * The DndContext for feature 031's hand arrangement lives HERE rather than
 * on the board, because this game has no board-level drag surface at all
 * (unlike Cahoots, whose single context also handles playing onto a pile).
 * Keeping it local also means this component still mounts standalone in its
 * own tests.
 *
 * Note each card is dragged by an explicit grip, not by the card itself:
 * CardTile renders `disabled={disabled || !onClick}`, so off-turn the card
 * is a natively disabled <button>, which dispatches no pointer events -- it
 * would be undraggable exactly when a waiting player most wants to tidy up.
 * The grip also keeps KeyboardSensor's Space/Enter from colliding with the
 * card button's own select-toggle.
 */
export function HandView({
  hand,
  selectedCardIds,
  interactive,
  onCardClicked,
  itemIds,
  onReorder,
  onSort,
  onResetOrder,
  isCustomised,
}: HandViewProps) {
  const { t } = useTranslation();
  const sensors = useHandSortSensors();
  const selectedCards = hand.filter((c) => selectedCardIds.includes(c.id));

  const labelFor = (id: string) => {
    const card = hand.find((c) => c.id === id);
    return card ? cardLabel(card, t) : id;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    onReorder(String(event.active.id), String(event.over.id));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd} accessibility={handSortAccessibility(t, labelFor)}>
      <div className={styles.hand} role="group" aria-label={t('regicide.hand.ariaLabel')}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {hand.map((card) => {
            const isSelected = selectedCardIds.includes(card.id);
            const legal = isSelected || isLegalSelection([...selectedCards, card]);
            const clickable = interactive && legal;
            return (
              <SortableCardSlot
                key={card.id}
                id={card.id}
                handle
                dragLabel={t('handSort.dragHandleAriaLabel', { card: cardLabel(card, t) })}
              >
                <CardTile
                  card={card}
                  selected={isSelected}
                  onClick={clickable ? () => onCardClicked(card.id) : undefined}
                  disabled={interactive && !legal}
                  disabledReason={interactive && !legal ? t('regicide.cardIllegalReason') : undefined}
                />
              </SortableCardSlot>
            );
          })}
        </SortableContext>
      </div>
      <HandSortControls
        presets={SORT_PRESETS}
        onSort={onSort}
        onReset={onResetOrder}
        isCustomised={isCustomised}
        cardCount={hand.length}
      />
    </DndContext>
  );
}

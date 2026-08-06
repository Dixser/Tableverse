import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Suit } from './deck.js';
import { isLegalTrickPlay } from './trickResolution.js';
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
  /** null when leading (or not in the trick phase at all) -- see trickResolution.ts's isLegalTrickPlay. */
  ledSuit: Suit | null;
  /** False outside the acting player's own turn, or whenever it isn't legal to play at all right now (drafting, trickConfirm wait). Gates PLAYING only -- rearranging the hand stays available regardless (feature 031). */
  interactive: boolean;
  onCardClicked: (cardID: string) => void;
  /** The seat's own currently-communicated card id, if any -- rendered dimmed as a reminder it's still un-played, per the rulebook's reminder-card convention. */
  communicatedCardID?: string | null;
  /** feature 031: hand-order actions, straight from useHandOrder. */
  itemIds: string[];
  onReorder: (activeId: string, overId: string) => void;
  onSort: (comparator: (a: Card, b: Card) => number) => void;
  onResetOrder: () => void;
  isCustomised: boolean;
}

/**
 * The acting player's own hand -- clicking a legal card plays it
 * immediately (a trick play is always a single card, unlike Regicide's
 * multi-card combo selection). Legality is computed via trickResolution's
 * own isLegalTrickPlay rather than a locally reimplemented follow-suit
 * check, same reuse convention as regicide/HandView.tsx.
 *
 * Feature 031's DndContext lives here for the same reason as Regicide's:
 * this game has no board-level drag surface, and keeping it local means the
 * component still mounts standalone in its own tests. Cards are dragged by an
 * explicit grip, never by the card itself -- CardTile renders
 * `disabled={disabled || !onClick}`, so off-turn (and on any illegal card)
 * the card is a natively disabled <button> that dispatches no pointer events,
 * and KeyboardSensor's Space/Enter would otherwise collide with the card
 * button's own "play this card" meaning.
 */
export function HandView({
  hand,
  ledSuit,
  interactive,
  onCardClicked,
  communicatedCardID,
  itemIds,
  onReorder,
  onSort,
  onResetOrder,
  isCustomised,
}: HandViewProps) {
  const { t } = useTranslation();
  const sensors = useHandSortSensors();

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
      <div className={styles.hand} role="group" aria-label={t('crew.hand.ariaLabel')}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {hand.map((card) => {
            const legal = isLegalTrickPlay(hand, ledSuit, card);
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
                  onClick={clickable ? () => onCardClicked(card.id) : undefined}
                  disabled={interactive && !legal}
                  disabledReason={interactive && !legal ? t('crew.cardIllegalReason') : undefined}
                  faded={communicatedCardID === card.id}
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

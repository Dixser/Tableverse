import { useCallback, useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { reconcileOrder } from './handOrder.js';

export interface HandOrder<TCard extends { id: string }> {
  /** The hand in the player's chosen order -- pass THIS to every hand-rendering child. */
  orderedHand: TCard[];
  /** The same order as ids only, for SortableContext's `items`. */
  itemIds: string[];
  /** dnd-kit's onDragEnd, translated: move `activeId` into `overId`'s slot. */
  moveCard: (activeId: string, overId: string) => void;
  /** One-click preset. The comparator is the game's own -- see each game's handSort.ts. */
  applySort: (comparator: (a: TCard, b: TCard) => number) => void;
  /** Back to raw server (dealt) order. */
  resetOrder: () => void;
  /** True once the player has an order of their own -- drives Reset's disabled state. */
  isCustomised: boolean;
}

/**
 * Session-only, purely cosmetic hand arrangement. Never written to `G`,
 * never sent as a move, never persisted (no localStorage -- it resets on
 * reload, by design, per feature 031's resolved decisions).
 *
 * The visible order is DERIVED on every render from the incoming server hand
 * rather than synced in a `useEffect`: a drawn or played card is reflected in
 * the same paint, with no frame of stale order. `preferred` is only a
 * preference; the server hand is the truth about which cards exist.
 *
 * Seat switching needs no special handling. Card ids are unique per deck in
 * all three consuming games, so switching seats makes every remembered id
 * absent from `hand` and reconcileOrder falls back to pure server order.
 */
export function useHandOrder<TCard extends { id: string }>(hand: TCard[]): HandOrder<TCard> {
  const [preferred, setPreferred] = useState<string[]>([]);

  // Identity of the hand's *contents*, standing in for `hand` itself as a memo
  // dependency: boards re-render on every server state push, handing us a fresh
  // array object each time even when nothing about the hand actually changed.
  const handKey = hand.map((card) => card.id).join(' ');

  const itemIds = useMemo(
    () => reconcileOrder(preferred, hand.map((card) => card.id)),
    [preferred, handKey],
  );

  const orderedHand = useMemo(() => {
    const byId = new Map(hand.map((card) => [card.id, card]));
    // Total by construction: reconcileOrder only ever returns ids from `hand`.
    return itemIds.map((id) => byId.get(id)!);
  }, [itemIds, handKey]);

  const moveCard = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;
      const from = itemIds.indexOf(activeId);
      const to = itemIds.indexOf(overId);
      if (from < 0 || to < 0) return;
      // Written from the RECONCILED order, not from `preferred`: the indices
      // have to mean what the player actually sees. Doing it this way also
      // prunes any stale ids still sitting in `preferred`, as a side effect.
      setPreferred(arrayMove(itemIds, from, to));
    },
    [itemIds],
  );

  const applySort = useCallback(
    (comparator: (a: TCard, b: TCard) => number) => {
      setPreferred([...orderedHand].sort(comparator).map((card) => card.id));
    },
    [orderedHand],
  );

  const resetOrder = useCallback(() => setPreferred([]), []);

  return { orderedHand, itemIds, moveCard, applySort, resetOrder, isCustomised: preferred.length > 0 };
}

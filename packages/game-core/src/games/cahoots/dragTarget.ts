export type HandDragTarget =
  | { kind: 'pile'; pileIndex: number }
  | { kind: 'reorder'; overCardId: string }
  | { kind: 'none' };

/**
 * The one place a drop's meaning is decided in this game (feature 031).
 *
 * Cahoots is the only board whose single DndContext serves two purposes: a
 * hand card dropped on a pile is PLAYED, and a hand card dropped on another
 * hand card REORDERS. The two id spaces are disjoint by construction --
 * PileZone registers `pile-{index}`, while SortableContext registers each
 * hand card under its own `${color}${number}-${copy}` id, which can never
 * start with "pile-".
 *
 * Extracted as a pure function rather than inlined in onDragEnd specifically
 * so every branch is testable in the default `node` environment: jsdom
 * reports zero-sized rects, so a simulated drag cannot reliably produce an
 * `over` at all (see spec/features/027-dnd-kit-integration/plan.md's
 * "Open risks").
 */
export function resolveDragTarget(
  overId: string | number | null | undefined,
  handCardIds: readonly string[],
): HandDragTarget {
  if (typeof overId !== 'string') return { kind: 'none' };

  if (overId.startsWith('pile-')) {
    // Matched as literal digits rather than parsed with Number(): `Number('')`
    // is 0, so a bare "pile-" would otherwise resolve to a real play on pile 0.
    const match = /^pile-(\d+)$/.exec(overId);
    return match ? { kind: 'pile', pileIndex: Number(match[1]) } : { kind: 'none' };
  }

  return handCardIds.includes(overId) ? { kind: 'reorder', overCardId: overId } : { kind: 'none' };
}

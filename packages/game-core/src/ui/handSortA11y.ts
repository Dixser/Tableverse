import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';
import type { TFunction } from 'i18next';

export interface HandSortAccessibility {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
}

/**
 * Localized replacements for dnd-kit's built-in drag announcements, which are
 * hardcoded English inside the library. This repo enforces locale parity
 * (packages/client/src/i18n/localeParity.test.ts), so shipping the defaults
 * would leave a Spanish player with English screen-reader output.
 *
 * `resolveLabel` turns a dnd-kit `UniqueIdentifier` back into something a
 * person can hear. Callers pass a game-specific resolver -- in the card games
 * that means each `CardTile.tsx`'s own `cardLabel`, and in Cahoots it must
 * also cope with a pile droppable id, since the same DndContext serves both
 * reordering and playing.
 */
export function handSortAccessibility(
  t: TFunction,
  resolveLabel: (id: string) => string,
): HandSortAccessibility {
  return {
    screenReaderInstructions: { draggable: t('handSort.a11y.instructions') },
    announcements: {
      onDragStart: ({ active }) => t('handSort.a11y.picked', { card: resolveLabel(String(active.id)) }),
      onDragOver: ({ over }) =>
        over ? t('handSort.a11y.over', { target: resolveLabel(String(over.id)) }) : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t('handSort.a11y.dropped', {
              card: resolveLabel(String(active.id)),
              target: resolveLabel(String(over.id)),
            })
          : t('handSort.a11y.cancelled'),
      onDragCancel: () => t('handSort.a11y.cancelled'),
    },
  };
}

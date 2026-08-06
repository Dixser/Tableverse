import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * One sensor configuration for every hand in the codebase.
 *
 * The `distance: 8` activation constraint is the load-bearing part. Without
 * it, `PointerSensor` activates on pointerdown and swallows the click that
 * follows -- which would break Regicide's click-to-select and Crew's
 * click-to-play outright, since in those games the card and the drag target
 * are the same element. With it, a press that never travels 8px is never a
 * drag at all and the click lands normally.
 *
 * This is a deliberate behaviour change for Cahoots, which shipped in feature
 * 029 with dnd-kit's unconstrained defaults. It is an improvement there too:
 * an 8px threshold stops a jittery tap from flinging a card onto a pile.
 *
 * `sortableKeyboardCoordinates` is what makes arrow-key reordering work; the
 * matching screen-reader wording lives in handSortA11y.ts.
 */
export function useHandSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * Pure ordering logic for a player's hand -- no React, no dnd-kit, so every
 * branch is testable in the default `node` environment.
 *
 * Layering note (applies to everything under `src/ui/`): nothing in this
 * directory may ever be exported from `src/index.ts`. That file is on
 * packages/server's real-runtime import path, and the rest of `src/ui/`
 * imports React. These modules are reachable only from a BoardComponent,
 * itself reachable only via `src/boards.ts` -> packages/client's
 * boardRegistry.ts. Same invariant boards.ts already documents.
 */

/**
 * Merges a player's chosen card order with the order the server actually
 * sent, which is always authoritative about *membership*.
 *
 * Server hands only ever grow at the end (`push` on deal/draw) and shrink by
 * `splice` on play, so the rules are:
 *   - keep every id the player already ordered, in the player's order;
 *   - append ids the player has never seen (freshly drawn) at the END --
 *     deliberately NOT sorted into place, so a drawn card is always where
 *     the player can see it arrived (see spec.md's trade-off note);
 *   - drop ids no longer in hand (played, discarded, or a different seat's
 *     hand entirely after a seat switch).
 *
 * Duplicates in `preferred` are collapsed, which makes the function total
 * even against a corrupted input and guarantees the caller's invariant
 * `result.length === actual.length`.
 */
export function reconcileOrder(preferred: readonly string[], actual: readonly string[]): string[] {
  const actualSet = new Set(actual);
  const taken = new Set<string>();
  const merged: string[] = [];

  for (const id of preferred) {
    if (actualSet.has(id) && !taken.has(id)) {
      merged.push(id);
      taken.add(id);
    }
  }
  for (const id of actual) {
    if (!taken.has(id)) {
      merged.push(id);
      taken.add(id);
    }
  }

  return merged;
}

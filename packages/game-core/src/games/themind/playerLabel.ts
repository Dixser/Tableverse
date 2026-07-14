import type { TFunction } from 'i18next';

/**
 * Resolves a seat's display label -- the claimed seat's username when
 * known, disambiguated with its seat number when this same name is
 * claiming more than one seat. Falls back to a plain "Seat N" label
 * (feature 010's `room.seatLabel` key) when no name has synced yet.
 * Duplicated from Love Letter's own helper of the same name/shape rather
 * than imported cross-game -- each game module is self-contained (see
 * tech-stack.md: games only share utility code via an explicit shared
 * module for structurally-related editions, not incidentally between
 * unrelated games).
 */
export function playerLabel(
  id: string,
  playerNames: Record<string, string> | undefined,
  t: TFunction,
): string {
  const seatFallback = t('room.seatLabel', { seatNumber: Number(id) + 1 });
  const name = playerNames?.[id];
  if (!name) return seatFallback;
  const sameNameCount = Object.values(playerNames ?? {}).filter((n) => n === name).length;
  return sameNameCount > 1 ? `${name} (${seatFallback})` : name;
}

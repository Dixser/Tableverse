import type { TFunction } from 'i18next';

/**
 * Resolves a seat's display label -- the claimed seat's username when
 * known, disambiguated with its seat number when this same name is
 * claiming more than one seat (SeatSwitcher's own multi-seat solo-play
 * case, where "Alice" alone wouldn't tell two of her own seats apart in a
 * TargetPicker/PlayArea/RoundWinsTracker row). Falls back to a plain
 * "Seat N" label (feature 010's `room.seatLabel` key) when no name has
 * synced yet -- same fallback GameoverBanner's own nameFor uses.
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

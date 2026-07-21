import type { TFunction } from 'i18next';

/** Same convention as regicide/loveletter/themind's own playerLabel.ts -- kept as a per-game copy, not a shared extraction. */
export function playerLabel(id: string, playerNames: Record<string, string> | undefined, t: TFunction): string {
  const seatFallback = t('room.seatLabel', { seatNumber: Number(id) + 1 });
  const name = playerNames?.[id];
  if (!name) return seatFallback;
  const sameNameCount = Object.values(playerNames ?? {}).filter((n) => n === name).length;
  return sameNameCount > 1 ? `${name} (${seatFallback})` : name;
}

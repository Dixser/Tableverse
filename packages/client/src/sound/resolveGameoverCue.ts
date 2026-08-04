import type { SoundCue } from '@tableverse/game-core';

export type OutcomeCue = Extract<SoundCue, 'win' | 'lose' | 'draw'>;

/**
 * Resolves ctx.gameover + the viewer's perspective into an outcome cue,
 * deliberately mirroring GameoverBanner's resolveGameoverMessage read of
 * the same { winner?, draw? } shape. Takes `unknown` for the same reason it
 * does: a non-conforming game must degrade rather than crash GameMount.
 *
 * Returns null for a spectator (playerID === null). GameoverBanner has an
 * observer-framed message for that case; a stinger has no equivalent -- a
 * "you won" chime is simply wrong for someone who did not play. Spectators
 * still hear every public G.log cue.
 *
 * Note an object carrying neither `winner` nor `draw` resolves to 'lose',
 * not null: that IS the shape a cooperative loss uses (see themind's and
 * regicide's endIf), and it is indistinguishable from an unrecognized
 * object shape. Only a non-object gameover is treated as malformed.
 */
export function resolveGameoverCue(gameover: unknown, playerID: string | null): OutcomeCue | null {
  if (!gameover || typeof gameover !== 'object') return null;
  if (playerID === null) return null;

  const result = gameover as { winner?: string | string[]; draw?: boolean };
  if (result.draw === true) return 'draw';

  const winnerIDs =
    result.winner === undefined
      ? []
      : Array.isArray(result.winner)
        ? result.winner
        : [result.winner];

  return winnerIDs.includes(playerID) ? 'win' : 'lose';
}

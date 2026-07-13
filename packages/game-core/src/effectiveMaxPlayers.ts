import type { GameModule } from './types.js';

/**
 * The seat picker needs to know how many seats a match can actually use
 * given the room's CURRENT settings, not just GameModule.maxPlayers's
 * static upper bound -- some games (e.g. Love Letter's classic edition)
 * reject a subset of the player counts their static minPlayers/maxPlayers
 * range would otherwise allow. Reuses the same Game.validateSetupData hook
 * the server's startMatch already runs (via boardgame.io's createMatch),
 * rather than introducing a second, parallel place for this constraint to
 * live that could drift out of sync with it.
 */
export function getEffectiveMaxPlayers(
  // G is in a contravariant position (moves take it as a parameter), so
  // GameModule<Specific> is never a structural subtype of GameModule<X> for
  // any concrete X -- same reasoning as gamesCatalog.ts's AnyGameModule.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: GameModule<any>,
  gameSettings: Record<string, unknown> | undefined,
): number {
  const validate = module.gameDef.validateSetupData;
  if (!validate) return module.maxPlayers;
  for (let numPlayers = module.maxPlayers; numPlayers >= module.minPlayers; numPlayers--) {
    if (validate(gameSettings, numPlayers) === undefined) return numPlayers;
  }
  return module.minPlayers;
}

export type { GameModule, BoardProps, JSONSchema, GameoverResult, GameLogEntry } from './types.js';
export { withGameName } from './types.js';
export { gamesCatalog, getGameModule } from './gamesCatalog.js';
export { validateGameSettings } from './settingsValidation.js';
export type { SettingsValidationError } from './settingsValidation.js';
export { getEffectiveMaxPlayers } from './effectiveMaxPlayers.js';
export { getNextLevelGameSettings } from './nextLevelGameSettings.js';

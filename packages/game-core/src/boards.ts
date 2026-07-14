/**
 * Client-only entry point. This is the ONE file in game-core that's
 * allowed to import BoardComponents (and therefore their CSS) -- it must
 * never be imported by gamesCatalog.ts, types.ts, or any other file on
 * packages/server's real-runtime import path. Only packages/client's own
 * board registry (packages/client/src/boardRegistry.ts) imports from here.
 */
export { TicTacToeBoard } from './games/tictactoe/BoardComponent.js';
export { LoveLetterBoard } from './games/loveletter/BoardComponent.js';

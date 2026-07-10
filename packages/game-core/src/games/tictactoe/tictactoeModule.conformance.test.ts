import { testGameModuleConformance } from '../../../testing/conformance.js';
import { tictactoeModule } from './index.js';

// AC6: no hidden information in Tic-Tac-Toe, so secretKeys is empty --
// exercises the setup/serializability/determinism checks against a real,
// shipped game for the first time (feature 001's conformance tests only
// ever ran against a throwaway fixture).
testGameModuleConformance(tictactoeModule, { secretKeys: [] });

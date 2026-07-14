import { testGameModuleConformance } from '../../../testing/conformance.js';
import { loveletterModule } from './index.js';

// spec.md AC8: hands/privateReveals/chancellorDraw are the per-owner secret
// fields; _deck/_setAsideFacedown are "hidden from everyone" instead, which
// this generic per-owner check can't express -- see playerView.test.ts
// (AC9) for that separate guarantee.
testGameModuleConformance(loveletterModule, {
  secretKeys: ['hands', 'privateReveals', 'chancellorDraw'],
});

import { describe, expect, it } from 'vitest';
import {
  checkPlayerViewLeakFree,
  testGameModuleConformance,
} from '../conformance.js';
import { brokenDummyGameModule, dummyGameModule } from './dummyGame.js';

// Direction (a): the suite, run against the correct fixture, must pass in
// full. testGameModuleConformance registers real it() cases below — if any
// of them fail, this test file fails.
testGameModuleConformance(dummyGameModule, { secretKeys: ['hands'] });

// Direction (b): the suite's own leak check, run against a fixture whose
// playerView is a no-op passthrough, must fail — proving the check
// actually detects the violation it claims to, not just passing on the
// happy path.
describe('conformance suite correctly fails on a broken GameModule', () => {
  it('checkPlayerViewLeakFree throws for a playerView that leaks all hands', () => {
    expect(() =>
      checkPlayerViewLeakFree(brokenDummyGameModule, { secretKeys: ['hands'] }),
    ).toThrow(/leaked owner/);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The autoplay-unlock listener is bound as a side effect of loading
 * soundPlayer.ts, and it unbinds itself the first time it fires. That makes
 * it awkward to test alongside soundPlayer.ts's other behavior: every test
 * there calls vi.resetModules() and re-imports, so each prior module
 * instance leaves an un-fired listener on the jsdom window (which is shared
 * for a whole test FILE, unlike the module registry), and a single
 * dispatched gesture then fires all of them at once.
 *
 * Vitest gives each test file its own environment and module registry, so
 * isolating these two cases here means exactly one listener is ever
 * outstanding when a gesture is dispatched.
 */

function makeSuspendedAudio() {
  const resume = vi.fn();
  let constructed = 0;

  class FakeAudioContext {
    currentTime = 0;
    state = 'suspended';
    destination = {} as AudioDestinationNode;
    resume = resume;

    constructor() {
      constructed += 1;
    }

    createOscillator() {
      return {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }

    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
  }

  return { FakeAudioContext, resume, constructedCount: () => constructed };
}

describe('soundPlayer autoplay unlock', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('creates and resumes a suspended context on the first user gesture', async () => {
    const fake = makeSuspendedAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    await import('./soundPlayer.js');

    // Nothing constructed until the gesture actually happens.
    expect(fake.constructedCount()).toBe(0);

    window.dispatchEvent(new Event('pointerdown'));

    expect(fake.constructedCount()).toBe(1);
    expect(fake.resume).toHaveBeenCalledTimes(1);
  });

  it('unbinds after the first gesture, so later ones do nothing', async () => {
    const fake = makeSuspendedAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    await import('./soundPlayer.js');

    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));

    expect(fake.resume).toHaveBeenCalledTimes(1);
  });
});

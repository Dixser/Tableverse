// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeOscillator {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

function makeFakeAudio(initialState: 'running' | 'suspended' = 'running') {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const resume = vi.fn();
  let constructed = 0;

  class FakeAudioContext {
    currentTime = 0;
    state = initialState;
    destination = {} as AudioDestinationNode;
    resume = resume;

    constructor() {
      constructed += 1;
    }

    createOscillator(): FakeOscillator {
      const oscillator: FakeOscillator = {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }

    createGain(): FakeGain {
      const gain: FakeGain = {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }
  }

  return { FakeAudioContext, oscillators, gains, resume, constructedCount: () => constructed };
}

/** Each test needs a module instance whose load-time state (settings seeded
 * from localStorage, the unlock listener) is fresh, so the module is
 * imported dynamically after the globals are in place. */
async function loadPlayer() {
  return import('./soundPlayer.js');
}

describe('soundPlayer', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('does not construct an AudioContext at module load', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);

    await loadPlayer();

    expect(fake.constructedCount()).toBe(0);
  });

  it('plays a cue as one oscillator per step, started and stopped', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue } = await loadPlayer();

    // 'win' is a three-step rising triad.
    playCue('win');

    expect(fake.oscillators).toHaveLength(3);
    for (const oscillator of fake.oscillators) {
      expect(oscillator.type).toBe('triangle');
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
      expect(oscillator.connect).toHaveBeenCalledTimes(1);
    }
    expect(fake.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
  });

  it('plays a single-step cue as one oscillator', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue } = await loadPlayer();

    playCue('turn');

    expect(fake.oscillators).toHaveLength(1);
    expect(fake.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
  });

  it('creates no audio nodes at all when sound is disabled', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue, setSoundSettings } = await loadPlayer();

    setSoundSettings({ enabled: false, volume: 1 });
    playCue('win');

    expect(fake.oscillators).toHaveLength(0);
    expect(fake.constructedCount()).toBe(0);
  });

  it('creates no audio nodes when volume is zero', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue, setSoundSettings } = await loadPlayer();

    setSoundSettings({ enabled: true, volume: 0 });
    playCue('turn');

    expect(fake.oscillators).toHaveLength(0);
  });

  it('scales the peak gain by the configured volume', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue, setSoundSettings } = await loadPlayer();

    setSoundSettings({ enabled: true, volume: 0.5 });
    playCue('turn'); // peak 0.25 * 0.5

    const ramp = fake.gains[0]!.gain.linearRampToValueAtTime;
    expect(ramp).toHaveBeenCalledWith(0.125, 0.01);
  });

  it('clamps an out-of-range volume rather than amplifying', async () => {
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue, setSoundSettings, getSoundSettings } = await loadPlayer();

    setSoundSettings({ enabled: true, volume: 9 });
    expect(getSoundSettings().volume).toBe(1);

    playCue('turn');
    expect(fake.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 0.01);
  });

  it('is a silent no-op when the browser has no AudioContext at all', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const { playCue } = await loadPlayer();

    expect(() => playCue('win')).not.toThrow();
  });

  // The autoplay-unlock listener is covered in soundPlayer.unlock.test.ts,
  // not here -- see that file's header for why it needs its own module
  // registry.

  it('seeds its settings from localStorage at module load', async () => {
    localStorage.setItem(
      'tableverse:sound',
      JSON.stringify({ enabled: false, volume: 0.3 }),
    );
    const fake = makeFakeAudio();
    vi.stubGlobal('AudioContext', fake.FakeAudioContext);
    const { playCue, getSoundSettings } = await loadPlayer();

    expect(getSoundSettings()).toEqual({ enabled: false, volume: 0.3 });
    playCue('turn');
    expect(fake.oscillators).toHaveLength(0);
  });
});

describe('readStoredSoundSettings', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('returns the default when nothing is stored', async () => {
    const { readStoredSoundSettings, DEFAULT_SOUND_SETTINGS } = await loadPlayer();
    expect(readStoredSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('round-trips a well-formed stored value', async () => {
    localStorage.setItem('tableverse:sound', JSON.stringify({ enabled: true, volume: 0.25 }));
    const { readStoredSoundSettings } = await loadPlayer();
    expect(readStoredSoundSettings()).toEqual({ enabled: true, volume: 0.25 });
  });

  it('falls back to the default on unparseable JSON', async () => {
    localStorage.setItem('tableverse:sound', '{not json');
    const { readStoredSoundSettings, DEFAULT_SOUND_SETTINGS } = await loadPlayer();
    expect(readStoredSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it.each([
    ['wrong shape', JSON.stringify({ enabled: 'yes', volume: 0.5 })],
    ['missing volume', JSON.stringify({ enabled: true })],
    ['non-finite volume', JSON.stringify({ enabled: true, volume: null })],
    ['a bare array', JSON.stringify([])],
    ['a bare string', JSON.stringify('loud')],
  ])('falls back to the default for %s', async (_label, stored) => {
    localStorage.setItem('tableverse:sound', stored);
    const { readStoredSoundSettings, DEFAULT_SOUND_SETTINGS } = await loadPlayer();
    expect(readStoredSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('clamps a stored volume outside 0..1', async () => {
    localStorage.setItem('tableverse:sound', JSON.stringify({ enabled: true, volume: 5 }));
    const { readStoredSoundSettings } = await loadPlayer();
    expect(readStoredSoundSettings().volume).toBe(1);
  });
});

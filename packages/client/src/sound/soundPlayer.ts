import type { SoundCue } from '@tableverse/game-core';

export interface SoundSettings {
  enabled: boolean;
  /** 0..1, multiplied into each cue's own peak gain. */
  volume: number;
}

export const SOUND_STORAGE_KEY = 'tableverse:sound';

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 };

/**
 * Reads the stored preference, falling back to the default on anything
 * unexpected. Unlike theme's plain 'light' | 'dark' string this key holds
 * structured data, so a corrupt value is a real possibility and must not
 * throw on the module-load read below.
 *
 * Lives here rather than in useSoundSettings so the singleton can seed
 * itself before React mounts -- a cue can otherwise fire at the volume of
 * whatever the default happened to be, briefly ignoring the user's choice.
 */
export function readStoredSoundSettings(): SoundSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SOUND_SETTINGS;
  const raw = localStorage.getItem(SOUND_STORAGE_KEY);
  if (raw === null) return DEFAULT_SOUND_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SOUND_SETTINGS;
    const { enabled, volume } = parsed as Partial<SoundSettings>;
    if (typeof enabled !== 'boolean' || typeof volume !== 'number' || !Number.isFinite(volume)) {
      return DEFAULT_SOUND_SETTINGS;
    }
    return { enabled, volume: Math.min(1, Math.max(0, volume)) };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

interface CueSpec {
  /** Frequencies played in sequence, Hz. One entry = a single blip. */
  steps: number[];
  /** Seconds per step. */
  stepDuration: number;
  type: OscillatorType;
  /** Peak gain before the user's volume multiplier. */
  peak: number;
}

/**
 * What each semantic cue actually sounds like -- the ONLY place in the
 * codebase that decides this. A game names a SoundCue and never reaches
 * past it, which is what makes replacing these with real audio files a
 * change confined to this file.
 */
const CUES: Record<SoundCue, CueSpec> = {
  turn: { steps: [880], stepDuration: 0.12, type: 'sine', peak: 0.25 },
  round: { steps: [587.33, 880], stepDuration: 0.13, type: 'sine', peak: 0.24 },
  win: { steps: [523.25, 659.25, 783.99], stepDuration: 0.14, type: 'triangle', peak: 0.3 },
  lose: { steps: [392.0, 311.13], stepDuration: 0.22, type: 'triangle', peak: 0.3 },
  draw: { steps: [440, 440], stepDuration: 0.16, type: 'sine', peak: 0.25 },
  play: { steps: [660], stepDuration: 0.06, type: 'sine', peak: 0.15 },
  success: { steps: [659.25, 987.77], stepDuration: 0.1, type: 'triangle', peak: 0.28 },
  failure: { steps: [196.0, 155.56], stepDuration: 0.18, type: 'sawtooth', peak: 0.22 },
  special: { steps: [784, 1046.5, 784], stepDuration: 0.09, type: 'square', peak: 0.2 },
};

/** Gain ramp-in, seconds. Without it every blip starts on a discontinuity
 * and clicks audibly. */
const ATTACK_SECONDS = 0.01;

let settings: SoundSettings = readStoredSoundSettings();
let context: AudioContext | null = null;
let unlockBound = false;

type AudioContextCtor = new () => AudioContext;

/**
 * Deliberately lazy: constructing an AudioContext at module load would both
 * waste one for a user who never enables sound, and create it outside any
 * user gesture (see bindUnlock). Returns null when the browser has no
 * AudioContext at all -- which is the case in jsdom, so every existing
 * client test stays silent without needing a vitest.setup.ts polyfill.
 */
function getContext(): AudioContext | null {
  if (context) return context;
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  context = new Ctor();
  return context;
}

/**
 * Browsers refuse to start an audio context before a user gesture, so a cue
 * fired by the first state update after page load would be silently
 * dropped. Listens once for the earliest gesture and resumes. playCue
 * resumes defensively too, for the case where sound was switched on after
 * this already fired.
 */
function bindUnlock(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const unlock = (): void => {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

bindUnlock();

/** Write-through target for useSoundSettings, mirroring how useTheme writes
 * through to document.documentElement.dataset. */
export function setSoundSettings(next: SoundSettings): void {
  settings = { enabled: next.enabled, volume: Math.min(1, Math.max(0, next.volume)) };
}

export function getSoundSettings(): SoundSettings {
  return settings;
}

/** Plays one cue. Silent (and never throws) when disabled, when volume is
 * zero, or when the browser has no Web Audio support at all. */
export function playCue(cue: SoundCue): void {
  if (!settings.enabled || settings.volume <= 0) return;
  const spec = CUES[cue];
  if (!spec) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const startAt = ctx.currentTime;
  const peak = spec.peak * settings.volume;

  spec.steps.forEach((frequency, index) => {
    const at = startAt + index * spec.stepDuration;
    const until = at + spec.stepDuration;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(frequency, at);

    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + ATTACK_SECONDS);
    gain.gain.linearRampToValueAtTime(0, until);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(until);
  });
}

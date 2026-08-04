import { useCallback, useState } from 'react';
import {
  SOUND_STORAGE_KEY,
  readStoredSoundSettings,
  setSoundSettings,
  type SoundSettings,
} from './soundPlayer.js';

export interface SoundSettingsState {
  settings: SoundSettings;
  setEnabled: (enabled: boolean) => void;
  /** Clamped to 0..1 before it is stored or applied. */
  setVolume: (volume: number) => void;
}

/**
 * Owns all reads/writes of the stored sound preference after first paint,
 * structurally mirroring theme/useTheme.ts. The one difference: this key
 * holds structured JSON rather than a plain string, so the read is
 * defensive (see readStoredSoundSettings).
 *
 * Writes through to the soundPlayer singleton the same way useTheme writes
 * through to document.documentElement.dataset -- the singleton is what
 * actually makes noise, and it must never disagree with what this hook
 * last stored. No pre-paint script in index.html is needed here: unlike
 * theme, sound has no flash-of-wrong-state to avoid, and the singleton
 * seeds itself from the same key at module load.
 */
export function useSoundSettings(): SoundSettingsState {
  const [settings, setSettingsState] = useState<SoundSettings>(readStoredSoundSettings);

  const apply = useCallback((next: SoundSettings) => {
    const clamped: SoundSettings = {
      enabled: next.enabled,
      volume: Math.min(1, Math.max(0, next.volume)),
    };
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(clamped));
    setSoundSettings(clamped);
    setSettingsState(clamped);
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => apply({ ...settings, enabled }),
    [apply, settings],
  );

  const setVolume = useCallback(
    (volume: number) => apply({ ...settings, volume }),
    [apply, settings],
  );

  return { settings, setEnabled, setVolume };
}

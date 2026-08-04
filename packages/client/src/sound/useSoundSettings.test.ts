// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSoundSettings } from './useSoundSettings.js';
import { getSoundSettings, setSoundSettings } from './soundPlayer.js';

describe('useSoundSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    // The singleton is module-level state shared with soundPlayer's own
    // tests; reset it so a previous test's write can't leak in.
    setSoundSettings({ enabled: true, volume: 0.6 });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('starts from the default when nothing is stored', () => {
    const { result } = renderHook(() => useSoundSettings());
    expect(result.current.settings).toEqual({ enabled: true, volume: 0.6 });
  });

  it('initializes from a pre-existing stored value', () => {
    localStorage.setItem('tableverse:sound', JSON.stringify({ enabled: false, volume: 0.2 }));
    const { result } = renderHook(() => useSoundSettings());
    expect(result.current.settings).toEqual({ enabled: false, volume: 0.2 });
  });

  it('falls back to the default for a corrupt stored value', () => {
    localStorage.setItem('tableverse:sound', 'not json at all');
    const { result } = renderHook(() => useSoundSettings());
    expect(result.current.settings).toEqual({ enabled: true, volume: 0.6 });
  });

  it('setEnabled writes localStorage, the singleton, and state', () => {
    const { result } = renderHook(() => useSoundSettings());

    act(() => result.current.setEnabled(false));

    expect(result.current.settings.enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem('tableverse:sound')!)).toEqual({
      enabled: false,
      volume: 0.6,
    });
    expect(getSoundSettings()).toEqual({ enabled: false, volume: 0.6 });
  });

  it('setVolume preserves enabled and writes through', () => {
    const { result } = renderHook(() => useSoundSettings());

    act(() => result.current.setVolume(0.1));

    expect(result.current.settings).toEqual({ enabled: true, volume: 0.1 });
    expect(getSoundSettings()).toEqual({ enabled: true, volume: 0.1 });
  });

  it('clamps a volume outside 0..1 before storing or applying', () => {
    const { result } = renderHook(() => useSoundSettings());

    act(() => result.current.setVolume(4));
    expect(result.current.settings.volume).toBe(1);

    act(() => result.current.setVolume(-2));
    expect(result.current.settings.volume).toBe(0);
    expect(getSoundSettings().volume).toBe(0);
  });

  it('applies successive changes without losing the other field', () => {
    const { result } = renderHook(() => useSoundSettings());

    act(() => result.current.setVolume(0.4));
    act(() => result.current.setEnabled(false));

    expect(result.current.settings).toEqual({ enabled: false, volume: 0.4 });
    expect(JSON.parse(localStorage.getItem('tableverse:sound')!)).toEqual({
      enabled: false,
      volume: 0.4,
    });
  });
});

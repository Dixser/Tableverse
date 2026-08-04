// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SoundToggle } from './SoundToggle.js';
import { SettingsSection } from '../menu/SettingsSection.js';
import { getSoundSettings, setSoundSettings } from './soundPlayer.js';

describe('SoundToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    setSoundSettings({ enabled: true, volume: 0.6 });
  });

  afterEach(() => localStorage.clear());

  it('renders a labelled on/off control and a volume control', () => {
    render(<SoundToggle />);

    expect(screen.getByLabelText('Sound')).toBeInTheDocument();
    expect(screen.getByLabelText('Volume')).toBeInTheDocument();
  });

  it('reflects the stored preference on mount', () => {
    localStorage.setItem('tableverse:sound', JSON.stringify({ enabled: false, volume: 0.25 }));

    render(<SoundToggle />);

    expect(screen.getByLabelText('Sound')).not.toBeChecked();
    expect(screen.getByLabelText('Volume')).toHaveValue('0.25');
  });

  it('toggling off persists and reaches the player singleton', () => {
    render(<SoundToggle />);

    fireEvent.click(screen.getByLabelText('Sound'));

    expect(screen.getByLabelText('Sound')).not.toBeChecked();
    expect(getSoundSettings().enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem('tableverse:sound')!).enabled).toBe(false);
  });

  it('changing the volume persists and reaches the player singleton', () => {
    render(<SoundToggle />);

    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '0.3' } });

    expect(getSoundSettings().volume).toBeCloseTo(0.3);
    expect(JSON.parse(localStorage.getItem('tableverse:sound')!).volume).toBeCloseTo(0.3);
  });

  it('disables the volume control while sound is off', () => {
    localStorage.setItem('tableverse:sound', JSON.stringify({ enabled: false, volume: 0.5 }));

    render(<SoundToggle />);

    expect(screen.getByLabelText('Volume')).toBeDisabled();
  });

  it('is rendered by SettingsSection alongside the theme and language controls', () => {
    render(<SettingsSection />);

    expect(screen.getByLabelText('Sound')).toBeInTheDocument();
    expect(screen.getByLabelText('Volume')).toBeInTheDocument();
    // The pre-existing controls are still there -- this is an addition,
    // not a replacement.
    expect(screen.getByRole('button', { name: /switch to/i })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayOrDiscardPicker } from './PlayOrDiscardPicker.js';

describe('PlayOrDiscardPicker', () => {
  it('shows the card being decided on and Play/Discard/Cancel actions', () => {
    render(
      <PlayOrDiscardPicker cardRank={5} onPlay={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('TEST_Prince')).toBeInTheDocument();
    expect(screen.getByText('TEST_play')).toBeInTheDocument();
    expect(screen.getByText('TEST_discard')).toBeInTheDocument();
    expect(screen.getByText('TEST_cancel')).toBeInTheDocument();
  });

  it('calls onPlay when Play is clicked', () => {
    const onPlay = vi.fn();
    render(
      <PlayOrDiscardPicker cardRank={5} onPlay={onPlay} onDiscard={vi.fn()} onCancel={vi.fn()} />,
    );
    screen.getByText('TEST_play').click();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('calls onDiscard when Discard is clicked', () => {
    const onDiscard = vi.fn();
    render(
      <PlayOrDiscardPicker cardRank={5} onPlay={vi.fn()} onDiscard={onDiscard} onCancel={vi.fn()} />,
    );
    screen.getByText('TEST_discard').click();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <PlayOrDiscardPicker cardRank={5} onPlay={vi.fn()} onDiscard={vi.fn()} onCancel={onCancel} />,
    );
    screen.getByText('TEST_cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

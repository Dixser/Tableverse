// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { GuardGuessPicker } from './GuardGuessPicker.js';

describe('GuardGuessPicker (AC4)', () => {
  it('offers every rank except Guard itself', () => {
    render(<GuardGuessPicker onGuess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('TEST_Guard')).toBeNull();
    expect(screen.getByText('TEST_Priest')).toBeInTheDocument();
    expect(screen.getByText('TEST_Princess')).toBeInTheDocument();
    // 9 guessable ranks (0-9 excluding 1) + 1 cancel button.
    expect(screen.getAllByRole('button')).toHaveLength(10);
  });

  it('calls onGuess with the chosen rank', () => {
    const onGuess = vi.fn();
    render(<GuardGuessPicker onGuess={onGuess} onCancel={vi.fn()} />);
    screen.getByText('TEST_Princess').click();
    expect(onGuess).toHaveBeenCalledWith(9);
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<GuardGuessPicker onGuess={vi.fn()} onCancel={onCancel} />);
    screen.getByText('TEST_cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

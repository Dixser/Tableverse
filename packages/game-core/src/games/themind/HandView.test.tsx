// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { HandView } from './HandView.js';

describe('HandView', () => {
  it('only the lowest card is clickable', () => {
    const onPlayLowest = vi.fn();
    render(<HandView hand={[5, 20, 90]} interactive onPlayLowest={onPlayLowest} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeDisabled();
    buttons[0]!.click();
    expect(onPlayLowest).toHaveBeenCalledTimes(1);
  });

  it('the lowest card is disabled when not interactive', () => {
    render(<HandView hand={[5]} interactive={false} onPlayLowest={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows an empty-hand message with no cards', () => {
    render(<HandView hand={[]} interactive onPlayLowest={vi.fn()} />);
    expect(screen.getByText('TEST_hand_empty')).toBeInTheDocument();
  });
});

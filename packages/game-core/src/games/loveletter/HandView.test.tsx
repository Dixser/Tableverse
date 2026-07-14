// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { HandView } from './HandView.js';

describe('HandView', () => {
  it('renders both held cards', () => {
    render(<HandView hand={[2, 0]} interactive onCardClicked={vi.fn()} />);
    expect(screen.getByText('TEST_Priest')).toBeInTheDocument();
    expect(screen.getByText('TEST_Spy')).toBeInTheDocument();
  });

  it('reports the clicked card (handIndex, rank) -- no play/discard/target decision made here', () => {
    const onCardClicked = vi.fn();
    render(<HandView hand={[2, 0]} interactive onCardClicked={onCardClicked} />);
    screen.getByText('TEST_Priest').closest('button')!.click();
    expect(onCardClicked).toHaveBeenCalledWith(0, 2);
  });

  it('is inert (no callback fires) when interactive is false', () => {
    const onCardClicked = vi.fn();
    render(<HandView hand={[2, 0]} interactive={false} onCardClicked={onCardClicked} />);
    const button = screen.getByText('TEST_Priest').closest('button')!;
    expect(button).toBeDisabled();
    button.click();
    expect(onCardClicked).not.toHaveBeenCalled();
  });

  it('AC5: the Countess disables the King/Prince held alongside it, with an explanation', () => {
    render(<HandView hand={[8, 7]} interactive onCardClicked={vi.fn()} />);
    const kingButton = screen.getByText('TEST_King').closest('button')!;
    expect(kingButton).toBeDisabled();
    expect(kingButton).toHaveAttribute('title', 'TEST_countess_forced_hint');
    expect(screen.getByText('TEST_Countess').closest('button')).not.toBeDisabled();
  });

  it('AC5: neither card is disabled when the Countess is held with an unrelated card', () => {
    render(<HandView hand={[8, 2]} interactive onCardClicked={vi.fn()} />);
    expect(screen.getByText('TEST_Countess').closest('button')).not.toBeDisabled();
    expect(screen.getByText('TEST_Priest').closest('button')).not.toBeDisabled();
  });

  it('a Countess-blocked card stays inert even when interactive is true', () => {
    const onCardClicked = vi.fn();
    render(<HandView hand={[8, 5]} interactive onCardClicked={onCardClicked} />);
    const princeButton = screen.getByText('TEST_Prince').closest('button')!;
    princeButton.click();
    expect(onCardClicked).not.toHaveBeenCalled();
  });
});

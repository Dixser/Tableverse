// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { CardTile } from './CardTile.js';
import type { Card } from './deck.js';

const numberCard: Card = { id: 'S7', kind: 'number', suit: 'S', rank: 7 };
const companionCard: Card = { id: 'HAC', kind: 'companion', suit: 'H' };
const jesterCard: Card = { id: 'Jester1', kind: 'jester' };
const faceCard: Card = { id: 'DK', kind: 'face', suit: 'D', rank: 'K' };

describe('CardTile', () => {
  it('renders a number card as a separate suit icon and rank, with the combined label as its accessible name', () => {
    render(<CardTile card={numberCard} />);
    expect(screen.getByText('TEST_S')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName('TEST_S 7');
  });

  it('renders a companion card as a separate suit icon and a fixed "A" rank (the print-and-play Ace), never translated', () => {
    render(<CardTile card={companionCard} />);
    expect(screen.getByText('TEST_H')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName('TEST_H A');
  });

  it('renders a jester card label with no suit', () => {
    render(<CardTile card={jesterCard} />);
    expect(screen.getByText('TEST_Jester')).toBeInTheDocument();
  });

  it('renders a face card as a separate suit icon and rank, with the combined label as its accessible name', () => {
    render(<CardTile card={faceCard} />);
    expect(screen.getByText('TEST_D')).toBeInTheDocument();
    expect(screen.getByText('TEST_K')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName('TEST_D TEST_K');
  });

  it('is inert (disabled) when no onClick is supplied', () => {
    render(<CardTile card={numberCard} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clickable and not disabled', () => {
    const onClick = vi.fn();
    render(<CardTile card={numberCard} onClick={onClick} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    button.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('renders disabled with a title reason when disabled is set even with an onClick', () => {
    const onClick = vi.fn();
    render(<CardTile card={numberCard} onClick={onClick} disabled disabledReason="TEST_reason" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'TEST_reason');
  });

  it('shows attack/health stats only when showStats is set on a face card', () => {
    render(<CardTile card={faceCard} showStats />);
    expect(screen.getByText('TEST_atk_20_hp_40')).toBeInTheDocument();
  });

  it('does not show stats for a non-face card even with showStats', () => {
    render(<CardTile card={numberCard} showStats />);
    expect(screen.queryByText(/TEST_atk_/)).toBeNull();
  });
});

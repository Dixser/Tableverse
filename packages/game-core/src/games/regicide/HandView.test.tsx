// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { HandView } from './HandView.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h4: Card = { id: 'H4', kind: 'number', suit: 'H', rank: 4 };
const d4: Card = { id: 'D4', kind: 'number', suit: 'D', rank: 4 };
const c4: Card = { id: 'C4', kind: 'number', suit: 'C', rank: 4 };
const s7: Card = { id: 'S7', kind: 'number', suit: 'S', rank: 7 };
const faceJ: Card = { id: 'SJ', kind: 'face', suit: 'S', rank: 'J' };
const companion: Card = { id: 'HAC', kind: 'companion', suit: 'H' };
const jester: Card = { id: 'Jester1', kind: 'jester' };

describe('HandView', () => {
  it('AC1: every card is enabled when nothing is selected yet', () => {
    render(
      <HandView hand={[s4, s7, faceJ]} selectedCardIds={[]} interactive onCardClicked={vi.fn()} />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toBeDisabled();
    }
  });

  it('AC1: clicking an unselected but still-legal card calls onCardClicked, and a selected card is marked pressed', () => {
    const onCardClicked = vi.fn();
    render(
      <HandView hand={[s4, h4]} selectedCardIds={['S4']} interactive onCardClicked={onCardClicked} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    buttons[1]!.click(); // H4 -- same rank as S4, sum 8 <= 10, still legal.
    expect(onCardClicked).toHaveBeenCalledWith('H4');
  });

  it('AC1: a selected card remains clickable (to deselect)', () => {
    const onCardClicked = vi.fn();
    render(<HandView hand={[s4]} selectedCardIds={['S4']} interactive onCardClicked={onCardClicked} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    button.click();
    expect(onCardClicked).toHaveBeenCalledWith('S4');
  });

  it('AC2: after selecting a number card, a different rank and every face/jester card disables', () => {
    render(
      <HandView
        hand={[s4, h4, s7, faceJ, jester]}
        selectedCardIds={['S4']}
        interactive
        onCardClicked={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toBeDisabled(); // S4 itself -- selected, deselectable.
    expect(buttons[1]).not.toBeDisabled(); // H4 -- same rank, sum 8 <= 10.
    expect(buttons[2]).toBeDisabled(); // S7 -- different rank.
    expect(buttons[3]).toBeDisabled(); // face card.
    expect(buttons[4]).toBeDisabled(); // jester.
  });

  it('AC2: a same-rank combo disables once a further card would exceed sum 10', () => {
    // S4 + H4 + D4 = 12 > 10 for a 3rd 4 -- but a 3-card same-rank combo is
    // only illegal here because the sum exceeds 10; C4 (a 4th) must also
    // disable once 3 are already selected (4*4=16 > 10 regardless).
    render(
      <HandView
        hand={[s4, h4, d4, c4]}
        selectedCardIds={['S4', 'H4']}
        interactive
        onCardClicked={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[2]).toBeDisabled(); // D4 -- sum would be 12.
    expect(buttons[3]).toBeDisabled(); // C4 -- same reason.
  });

  it('AC3: after selecting one Animal Companion, every card except exactly one more disables once 2 are selected', () => {
    render(
      <HandView
        hand={[companion, s4, s7, jester]}
        selectedCardIds={['HAC', 'S4']}
        interactive
        onCardClicked={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toBeDisabled(); // HAC -- selected.
    expect(buttons[1]).not.toBeDisabled(); // S4 -- selected.
    expect(buttons[2]).toBeDisabled(); // S7 -- would make a 3-card selection.
    expect(buttons[3]).toBeDisabled(); // jester -- never combos.
  });

  it('AC3: a lone Jester disables every other card', () => {
    render(
      <HandView hand={[jester, s4, faceJ]} selectedCardIds={['Jester1']} interactive onCardClicked={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toBeDisabled(); // jester itself -- selected.
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeDisabled();
  });

  it('is entirely non-interactive (no onClick fires) when interactive is false', () => {
    const onCardClicked = vi.fn();
    render(<HandView hand={[s4]} selectedCardIds={[]} interactive={false} onCardClicked={onCardClicked} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});

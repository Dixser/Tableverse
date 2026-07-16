// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayerStatusList } from './PlayerStatusList.js';

describe('PlayerStatusList', () => {
  it('AC7: renders each active seat label, sourced only from handCounts (never a hands record)', () => {
    render(
      <PlayerStatusList
        activeSeatIDs={['0', '1']}
        handCounts={{ '0': 7, '1': 5 }}
        playerID={null}
        playerNames={{ '0': 'Alice', '1': 'Bob' }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders one filled slot per held card, plus dimmed slots for remaining capacity up to the max hand size', () => {
    const { container } = render(
      <PlayerStatusList activeSeatIDs={['0', '1']} handCounts={{ '0': 5, '1': 7 }} playerID={null} />,
    );
    const rows = container.querySelectorAll('li');
    // 2 active seats -> MAX_HAND_SIZE[2] = 7.
    const heldA = rows[0]!.querySelectorAll('[class*="cardHeld"]');
    const emptyA = rows[0]!.querySelectorAll('[class*="cardEmpty"]');
    expect(heldA).toHaveLength(5);
    expect(emptyA).toHaveLength(2); // 7 - 5.

    const heldB = rows[1]!.querySelectorAll('[class*="cardHeld"]');
    const emptyB = rows[1]!.querySelectorAll('[class*="cardEmpty"]');
    expect(heldB).toHaveLength(7);
    expect(emptyB).toHaveLength(0); // at max hand size already.
  });

  it('falls back to 0 held (all capacity slots) for a seat missing from handCounts', () => {
    const { container } = render(
      <PlayerStatusList activeSeatIDs={['0', '1']} handCounts={{}} playerID={null} />,
    );
    const li = container.querySelector('li')!;
    expect(li.querySelectorAll('[class*="cardHeld"]')).toHaveLength(0);
    expect(li.querySelectorAll('[class*="cardEmpty"]')).toHaveLength(7); // MAX_HAND_SIZE[2] = 7.
  });

  it('marks the viewer\'s own seat', () => {
    const { container } = render(
      <PlayerStatusList activeSeatIDs={['0', '1']} handCounts={{ '0': 1, '1': 1 }} playerID="1" />,
    );
    const rows = container.querySelectorAll('li');
    expect(rows[0]!.className).toBe('');
    expect(rows[1]!.className).not.toBe('');
  });
});

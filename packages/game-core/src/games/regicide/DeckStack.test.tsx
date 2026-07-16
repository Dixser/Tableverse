// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeckStack } from './DeckStack.js';

function layerCount(container: HTMLElement) {
  return container.querySelectorAll('[class*="layer"]').length;
}

describe('DeckStack', () => {
  it('shows the exact count on the front card, and exposes it as the accessible label', () => {
    render(<DeckStack count={26} ariaLabel="Tavern deck: 26" />);
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByLabelText('Tavern deck: 26')).toBeInTheDocument();
  });

  it('renders no background layers and an empty/dashed front card at count 0', () => {
    const { container } = render(<DeckStack count={0} ariaLabel="Discard pile: 0" />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(layerCount(container)).toBe(0);
    expect(container.querySelector('[class*="empty"]')).not.toBeNull();
  });

  it.each([
    [1, 1],
    [9, 1],
    [10, 2],
    [19, 2],
    [20, 3],
    [50, 3],
  ])('count %i renders %i background layers', (count, expectedLayers) => {
    const { container } = render(<DeckStack count={count} ariaLabel={`count ${count}`} />);
    expect(layerCount(container)).toBe(expectedLayers);
  });

  it('layer count strictly increases (or holds) as the pile grows -- never thins out for a bigger pile', () => {
    const counts = [0, 1, 5, 9, 10, 15, 19, 20, 40];
    const { container, rerender } = render(<DeckStack count={counts[0]!} ariaLabel="x" />);
    let previous = layerCount(container);
    for (const count of counts.slice(1)) {
      rerender(<DeckStack count={count} ariaLabel="x" />);
      const current = layerCount(container);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

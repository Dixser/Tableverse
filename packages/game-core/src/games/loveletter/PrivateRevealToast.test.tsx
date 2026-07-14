// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PrivateRevealToast } from './PrivateRevealToast.js';

describe('PrivateRevealToast (AC7)', () => {
  it('renders a privateReveals entry as a distinctly-styled private element', () => {
    render(
      <PrivateRevealToast
        entries={[{ key: 'loveLetter.reveal.priestViewed', params: { opponent: '1', opponentRank: 9 } }]}
      />,
    );
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('TEST_priest_viewed 1 9');
  });

  it('renders nothing when there are no entries (AC9: other players/spectator)', () => {
    const { container } = render(<PrivateRevealToast entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders newly appended entries without duplicating already-shown ones', () => {
    const first = { key: 'loveLetter.reveal.priestViewed', params: { opponent: '1', opponentRank: 9 } };
    const second = { key: 'loveLetter.reveal.baronCompared', params: { opponent: '2', ownRank: 3, opponentRank: 7 } };
    const { rerender } = render(<PrivateRevealToast entries={[first]} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);

    rerender(<PrivateRevealToast entries={[first, second]} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('keeps an already-shown reveal visible even if entries later shrinks (round-boundary reset)', () => {
    const first = { key: 'loveLetter.reveal.priestViewed', params: { opponent: '1', opponentRank: 9 } };
    const { rerender } = render(<PrivateRevealToast entries={[first]} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);

    rerender(<PrivateRevealToast entries={[]} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

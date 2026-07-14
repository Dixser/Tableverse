// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { ShurikenPanel } from './ShurikenPanel.js';

describe('ShurikenPanel', () => {
  it('shows a propose button disabled with no star available', () => {
    render(
      <ShurikenPanel
        stars={0}
        activeSeatIDs={['0', '1']}
        playerID="0"
        vote={null}
        onPropose={vi.fn()}
        onVote={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('proposing fires onPropose', () => {
    const onPropose = vi.fn();
    render(
      <ShurikenPanel
        stars={1}
        activeSeatIDs={['0', '1']}
        playerID="0"
        vote={null}
        onPropose={onPropose}
        onVote={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    screen.getByRole('button').click();
    expect(onPropose).toHaveBeenCalledTimes(1);
  });

  it('shows every active seat\'s vote status once a proposal is pending', () => {
    render(
      <ShurikenPanel
        stars={1}
        activeSeatIDs={['0', '1', '2']}
        playerID="1"
        vote={{ proposerID: '0', votes: { '0': true, '1': false, '2': false } }}
        onPropose={vi.fn()}
        onVote={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Seat 1: TEST_agreed/)).toBeInTheDocument();
    expect(screen.getByText(/Seat 2: TEST_waiting/)).toBeInTheDocument();
  });

  it('a seat that has not yet voted can agree or decline', () => {
    const onVote = vi.fn();
    render(
      <ShurikenPanel
        stars={1}
        activeSeatIDs={['0', '1']}
        playerID="1"
        vote={{ proposerID: '0', votes: { '0': true, '1': false } }}
        onPropose={vi.fn()}
        onVote={onVote}
        onCancel={vi.fn()}
      />,
    );
    screen.getByText('TEST_agree').click();
    expect(onVote).toHaveBeenCalledWith(true);
  });

  it('only the proposer sees a cancel button', () => {
    render(
      <ShurikenPanel
        stars={1}
        activeSeatIDs={['0', '1']}
        playerID="1"
        vote={{ proposerID: '0', votes: { '0': true, '1': false } }}
        onPropose={vi.fn()}
        onVote={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('TEST_cancel')).toBeNull();
  });
});

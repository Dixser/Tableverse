// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { TheMindBoard } from './BoardComponent.js';
import type { TheMindView } from './gameDef.js';

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    numPlayers: 2,
    playOrder: ['0', '1'],
    playOrderPos: 0,
    activePlayers: { '0': null, '1': null },
    currentPlayer: '0',
    turn: 1,
    phase: 'default',
    ...overrides,
  } as Ctx;
}

function view(overrides: Partial<TheMindView> = {}): TheMindView {
  return {
    activeSeatIDs: ['0', '1'],
    totalLevels: 12,
    level: 1,
    lives: 2,
    stars: 1,
    hands: { '0': [5, 40] },
    handCounts: { '0': 2, '1': 1 },
    playedCards: [],
    setAsideCards: [],
    starDiscards: [],
    shurikenVote: null,
    log: [],
    matchResult: null,
    ...overrides,
  };
}

describe('TheMindBoard', () => {
  it('renders level/lives/stars status, hand counts, and own hand', () => {
    render(
      <TheMindBoard
        G={view()}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByText('TEST_level 1 12')).toBeInTheDocument();
    expect(screen.getByText('TEST_lives 2')).toBeInTheDocument();
    expect(screen.getByText('TEST_stars 1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('clicking the lowest hand card calls moves.playCard with no arguments', () => {
    const playCard = vi.fn();
    render(
      <TheMindBoard
        G={view()}
        ctx={makeCtx()}
        moves={{ playCard }}
        playerID="0"
        isActive={true}
      />,
    );
    screen.getByText('5').click();
    expect(playCard).toHaveBeenCalledWith();
  });

  it('a spectator (playerID null) sees no hand', () => {
    render(
      <TheMindBoard
        G={view({ hands: {} })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn() }}
        playerID={null}
        isActive={false}
      />,
    );
    expect(screen.queryByText('5')).toBeNull();
  });

  it('shows the shuriken vote panel once a proposal is pending', () => {
    render(
      <TheMindBoard
        G={view({ shurikenVote: { proposerID: '0', votes: { '0': true, '1': false } } })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), voteShuriken: vi.fn() }}
        playerID="1"
        isActive={true}
      />,
    );
    expect(screen.getByText('TEST_agree')).toBeInTheDocument();
  });

  it('a pending shuriken vote disables the hand', () => {
    render(
      <TheMindBoard
        G={view({ shurikenVote: { proposerID: '1', votes: { '0': false, '1': true } } })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByText('5').closest('button')).toBeDisabled();
  });

  it('shows the win banner and hides the shuriken panel once the match is won', () => {
    render(
      <TheMindBoard
        G={view({ matchResult: 'won' })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn() }}
        playerID="0"
        isActive={false}
      />,
    );
    expect(screen.getByText('TEST_match_won')).toBeInTheDocument();
    expect(screen.queryByText('TEST_propose_shuriken 1')).toBeNull();
  });

  it('shows the loss banner once the match is lost', () => {
    render(
      <TheMindBoard
        G={view({ matchResult: 'lost', lives: 0 })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn() }}
        playerID="0"
        isActive={false}
      />,
    );
    expect(screen.getByText('TEST_match_lost')).toBeInTheDocument();
  });
});

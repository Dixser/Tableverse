// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { MagalufBoard } from './BoardComponent.js';
import { HIDDEN_LIMIT } from './gameDef.js';
import { DEFAULT_SETTINGS } from './settings.js';
import { newPlayer, type JumpRecord, type MagalufG, type MagalufPlayer } from './state.js';

const NAMES = { '0': 'Alice', '1': 'Bob', '2': 'Carol' };

function player(overrides: Partial<MagalufPlayer> = {}): MagalufPlayer {
  return { ...newPlayer(), ...overrides };
}

function makeG(overrides: Partial<MagalufG> = {}): MagalufG {
  const seats = overrides.activeSeatIDs ?? ['0', '1', '2'];
  return {
    activeSeatIDs: seats,
    settings: { ...DEFAULT_SETTINGS },
    day: 0,
    phase: 0,
    limit: HIDDEN_LIMIT,
    limitRevealed: false,
    turnSeatID: '0',
    alcoholDeck: [],
    alcoholDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    players: Object.fromEntries(seats.map((id) => [id, player()])),
    withdrawCounter: 0,
    lastDraw: null,
    pendingAdvance: null,
    roundConfirm: null,
    hostPlayerID: null,
    jumps: [],
    log: [],
    finished: false,
    ...overrides,
  };
}

function makeCtx(): Ctx {
  return {
    numPlayers: 3,
    playOrder: ['0', '1', '2'],
    playOrderPos: 0,
    activePlayers: null,
    currentPlayer: '0',
    turn: 1,
    phase: 'party',
  } as Ctx;
}

function renderBoard(G: MagalufG, playerID: string | null = '0', isActive = true) {
  const moves = { drink: vi.fn(), withdraw: vi.fn(), useItem: vi.fn() };
  const result = render(
    <MagalufBoard
      G={G}
      ctx={makeCtx()}
      moves={moves as never}
      playerID={playerID}
      isActive={isActive}
      playerNames={NAMES}
    />,
  );
  return { ...result, moves };
}

describe('MagalufBoard', () => {
  describe('layout and seats', () => {
    it('renders one panel per active seat and none for phantom seats (AC1)', () => {
      renderBoard(makeG({ activeSeatIDs: ['0', '1', '2'] }));
      expect(screen.getByTestId('player-panel-0')).toBeInTheDocument();
      expect(screen.getByTestId('player-panel-2')).toBeInTheDocument();
      expect(screen.queryByTestId('player-panel-3')).toBeNull();
    });

    it('renders at 3 and at 6 seats (AC10)', () => {
      for (const seats of [['0', '1', '2'], ['0', '1', '2', '3', '4', '5']]) {
        const { unmount } = renderBoard(makeG({ activeSeatIDs: seats }));
        expect(screen.getAllByTestId(/^player-panel-/)).toHaveLength(seats.length);
        unmount();
      }
    });

    it('resolves strings through t, never hardcoded copy (AC11)', () => {
      renderBoard(makeG());
      expect(screen.getByText('TEST_friday')).toBeInTheDocument();
      expect(screen.getByText('TEST_tardeo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'TEST_drink' })).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('shows controls only for the seat that is up (AC2)', () => {
      const G = makeG({ turnSeatID: '0' });
      const { unmount } = renderBoard(G, '0');
      expect(screen.getByTestId('action-bar')).toBeInTheDocument();
      unmount();

      renderBoard(G, '1');
      expect(screen.queryByTestId('action-bar')).toBeNull();
    });

    it('shows no controls to a spectator (AC2)', () => {
      renderBoard(makeG(), null, false);
      expect(screen.queryByTestId('action-bar')).toBeNull();
    });

    it('shows no controls while a round-confirm gate is open', () => {
      renderBoard(
        makeG({ roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] } }),
        '0',
      );
      expect(screen.queryByTestId('action-bar')).toBeNull();
    });

    it('wires each button to its move (AC3)', () => {
      const G = makeG();
      G.players['0']!.items = ['kebab'];
      const { moves } = renderBoard(G, '0');

      fireEvent.click(screen.getByRole('button', { name: 'TEST_drink' }));
      expect(moves.drink).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole('button', { name: 'TEST_withdraw' }));
      expect(moves.withdraw).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByTestId('use-kebab'));
      expect(moves.useItem).toHaveBeenCalledWith('kebab');
    });

    it('disables item buttons once one has been used this turn (AC4)', () => {
      const G = makeG();
      G.players['0']!.items = ['kebab', 'porro'];
      G.players['0']!.itemUsedThisTurn = true;
      renderBoard(G, '0');

      expect(screen.getByTestId('use-kebab')).toBeDisabled();
      expect(screen.getByTestId('use-porro')).toBeDisabled();
    });

    it('marks contraband distinctly from legal items (AC5)', () => {
      const G = makeG();
      G.players['0']!.items = ['kebab', 'farlopa'];
      renderBoard(G, '0');

      const legal = screen.getByTestId('item-0-kebab');
      const illegal = screen.getByTestId('item-0-farlopa');
      expect(legal.className).not.toBe(illegal.className);
    });
  });

  describe('the draw reveal', () => {
    it('renders the alcohol card and its event (AC6)', () => {
      renderBoard(makeG({ lastDraw: { seatID: '1', alcohol: 'pinta', event: 'foto' } }));
      expect(screen.getByTestId('drawn-cards')).toBeInTheDocument();
      expect(screen.getByTestId('card-pinta')).toHaveTextContent('TEST_pint');
      expect(screen.getByTestId('card-foto')).toHaveTextContent('TEST_photo');
      expect(screen.getByText('TEST_drew Bob')).toBeInTheDocument();
    });

    it('renders neither and does not crash with no draw yet (AC6)', () => {
      renderBoard(makeG({ lastDraw: null }));
      expect(screen.getByTestId('drawn-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('drawn-cards')).toBeNull();
    });

    it('renders an alcohol card whose event was skipped', () => {
      renderBoard(makeG({ lastDraw: { seatID: '0', alcohol: 'cana', event: null } }));
      expect(screen.getByTestId('card-cana')).toBeInTheDocument();
    });
  });

  describe('player state', () => {
    it('marks the resaca floor only when there is one (AC7)', () => {
      const withResaca = makeG();
      withResaca.players['0']!.resaca = 4;
      const { unmount } = renderBoard(withResaca);
      expect(screen.getAllByTestId('resaca-floor').length).toBeGreaterThan(0);
      unmount();

      renderBoard(makeG());
      expect(screen.queryByTestId('resaca-floor')).toBeNull();
    });

    it('renders each status distinctly (AC8)', () => {
      const G = makeG();
      G.players['0']!.status = 'withdrawn';
      G.players['1']!.status = 'arrested';
      G.players['2']!.status = 'dead';
      renderBoard(G);

      expect(screen.getByTestId('status-0')).toHaveTextContent('TEST_out');
      expect(screen.getByTestId('status-1')).toHaveTextContent('TEST_jail');
      expect(screen.getByTestId('status-2')).toHaveTextContent('TEST_dead');
    });

    it('keeps banked and at-risk points separate, never summed (AC9)', () => {
      const G = makeG();
      G.players['0']!.bankedVP = 40;
      G.players['0']!.roundVP = 13;
      renderBoard(G);

      expect(screen.getByTestId('banked-0')).toHaveTextContent('40');
      expect(screen.getByTestId('atrisk-0')).toHaveTextContent('13');
      expect(screen.queryByText('53')).toBeNull();
    });
  });

  describe('not leaking the limit', () => {
    it('shows the band and no number or marker while face-down (AC13)', () => {
      renderBoard(makeG({ limit: HIDDEN_LIMIT }));

      expect(screen.getAllByTestId('limit-band').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('limit-marker')).toBeNull();
      expect(screen.queryByTestId('limit-value')).toBeNull();
      expect(screen.queryByTestId('limit-chip-known')).toBeNull();
      expect(screen.queryByTestId(/^risk-/)).toBeNull();
      expect(screen.getByTestId('limit-chip-hidden')).toBeInTheDocument();
    });

    /**
     * The property the whole limitScale module exists to guarantee: the
     * geometry is derived from the DAY, never from the card drawn. Asserted by
     * showing it varies with the day and with nothing else — rendering the
     * same day twice with two different hidden limits would be tautological,
     * since playerView has already replaced both with HIDDEN_LIMIT before the
     * board sees them.
     */
    it('derives the band from the day, so it carries no information about the draw (AC14)', () => {
      const friday = renderBoard(makeG({ day: 0, limit: HIDDEN_LIMIT }));
      const fridayBand = screen.getByTestId('limit-chip-hidden').textContent;
      expect(fridayBand).toContain('26');
      expect(fridayBand).toContain('29');
      friday.unmount();

      renderBoard(makeG({ day: 2, limit: HIDDEN_LIMIT }));
      const sundayBand = screen.getByTestId('limit-chip-hidden').textContent;
      expect(sundayBand).toContain('14');
      expect(sundayBand).toContain('26');
      expect(sundayBand).not.toBe(fridayBand);
    });

    it('is unchanged by the players’ own state, so nobody leaks it either (AC14)', () => {
      const plain = renderBoard(makeG({ day: 0, limit: HIDDEN_LIMIT }));
      const plainBand = screen.getByTestId('limit-chip-hidden').textContent;
      plain.unmount();

      const drunk = makeG({ day: 0, limit: HIDDEN_LIMIT });
      drunk.players['0']!.intox = 25;
      drunk.players['1']!.intox = 40;
      renderBoard(drunk);
      expect(screen.getByTestId('limit-chip-hidden').textContent).toBe(plainBand);
    });

    it('replaces the band with a marker once the limit is visible (AC15)', () => {
      renderBoard(makeG({ limit: 27, limitRevealed: true }));

      expect(screen.getAllByTestId('limit-marker').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('limit-band')).toBeNull();
      expect(screen.getByTestId('limit-chip-known')).toHaveTextContent('27');
    });

    it('shows a risk badge matching poolChance for a seat over the limit (AC16)', () => {
      const G = makeG({ limit: 20, limitRevealed: true });
      G.players['0']!.intox = 22; // d = 2 -> 0.70 - 0.12 = 58%
      G.players['1']!.intox = 19; // under, no badge
      renderBoard(G);

      expect(screen.getByTestId('risk-0')).toHaveTextContent('58');
      expect(screen.queryByTestId('risk-1')).toBeNull();
    });
  });

  describe('the balcony overlay', () => {
    const jump = (over: Partial<JumpRecord> = {}): JumpRecord => ({
      day: 0,
      seatID: '1',
      d: 2,
      limit: 20,
      survived: true,
      legendVP: 5,
      lostVP: 12,
      ...over,
    });

    it('renders nothing on a board mounted with jumps already in G (AC23)', () => {
      renderBoard(makeG({ jumps: [jump(), jump({ seatID: '2' })] }));
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });

    it('opens on a newly appended jump, showing odds but not the outcome (AC20)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();

      rerender(
        <MagalufBoard
          G={{ ...G, jumps: [jump()] }}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={NAMES}
        />,
      );

      expect(screen.getByTestId('balcony-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('balcony-odds')).toHaveTextContent('58');
      expect(screen.queryByTestId('balcony-outcome')).toBeNull();
    });

    it('reveals pool with the legend bonus on the second beat (AC21)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      rerender(
        <MagalufBoard
          G={{ ...G, jumps: [jump({ survived: true, legendVP: 5 })] }}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={NAMES}
        />,
      );

      fireEvent.click(screen.getByTestId('balcony-jump'));
      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_pool');
      expect(screen.getByText('TEST_pool_body Bob 5')).toBeInTheDocument();
    });

    it('distinguishes the concrete (AC21)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      rerender(
        <MagalufBoard
          G={{ ...G, jumps: [jump({ survived: false, legendVP: 0 })] }}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={NAMES}
        />,
      );

      fireEvent.click(screen.getByTestId('balcony-jump'));
      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_concrete');
    });

    it('walks through two jumps from one update, then closes (AC22)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      const next = { ...G, jumps: [jump({ seatID: '1' }), jump({ seatID: '2' })] };
      const show = () =>
        rerender(
          <MagalufBoard
            G={next}
            ctx={makeCtx()}
            moves={{} as never}
            playerID="0"
            isActive
            playerNames={NAMES}
          />,
        );

      show();
      expect(screen.getByText('TEST_balcony_body Bob 2')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('balcony-jump'));
      fireEvent.click(screen.getByTestId('balcony-continue'));
      show();
      expect(screen.getByText('TEST_balcony_body Carol 2')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('balcony-jump'));
      fireEvent.click(screen.getByTestId('balcony-continue'));
      show();
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });

    it('skips the remainder in one go (AC22)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      const next = { ...G, jumps: [jump({ seatID: '1' }), jump({ seatID: '2' })] };
      const show = () =>
        rerender(
          <MagalufBoard
            G={next}
            ctx={makeCtx()}
            moves={{} as never}
            playerID="0"
            isActive
            playerNames={NAMES}
          />,
        );

      show();
      fireEvent.click(screen.getByTestId('balcony-skip'));
      show();
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });
  });
});

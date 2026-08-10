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
    pendingEvent: null,
    pendingChoice: null,
    roundAnchor: 0,
    lastStandingAwarded: false,
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
  const moves = {
    drink: vi.fn(),
    withdraw: vi.fn(),
    useItem: vi.fn(),
    revealEvent: vi.fn(),
    chooseEventOption: vi.fn(),
  };
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

  /**
   * The board half of the balcony fix. The engine resolves the weekend's last
   * jump inside the same move that sets `finished`, so `endIf` fires on the
   * tick the die lands -- without this signal the chrome announces the winner
   * over the top of the roll that decides them.
   */
  describe('holding the gameover banner during a jump', () => {
    const jump = (overrides: Partial<JumpRecord> = {}): JumpRecord => ({
      day: 2,
      seatID: '0',
      d: 3,
      limit: 22,
      roll: 5,
      die: 6,
      survived: true,
      legendVP: 6,
      poolVP: 40,
      lostVP: 0,
      bankedVP: 90,
      ...overrides,
    });

    /**
     * Mounts with the jumps that already existed, then lands new ones.
     *
     * The split matters: `useJumpQueue`'s watermark starts at whatever was
     * already in `G.jumps`, so a board mounted with a jump present treats it
     * as history. A jump is only ever shown to someone who was already
     * watching when it landed -- which is the case this fix is about.
     */
    function renderWithJumps(present: JumpRecord[], landing: JumpRecord[] = []) {
      const onRevealPending = vi.fn();
      const board = (jumps: JumpRecord[]) => (
        <MagalufBoard
          G={makeG({ jumps })}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={NAMES}
          onRevealPending={onRevealPending}
        />
      );
      const result = render(board(present));
      if (landing.length > 0) result.rerender(board([...present, ...landing]));
      return { ...result, onRevealPending };
    }

    it('reports pending while a jump is still unwatched', () => {
      const { onRevealPending } = renderWithJumps([], [jump()]);
      expect(onRevealPending).toHaveBeenLastCalledWith(true);
      expect(screen.getByTestId('balcony-overlay')).toBeInTheDocument();
    });

    it('reports nothing pending when there is no jump to show', () => {
      const { onRevealPending } = renderWithJumps([]);
      expect(onRevealPending).toHaveBeenLastCalledWith(false);
    });

    /** The overlay is two steps: press to jump, then read the die and move on. */
    const playOutOneJump = () => {
      fireEvent.click(screen.getByTestId('balcony-jump'));
      fireEvent.click(screen.getByTestId('balcony-continue'));
    };

    it('releases once the viewer dismisses the last jump', () => {
      const { onRevealPending } = renderWithJumps([], [jump()]);
      playOutOneJump();
      expect(onRevealPending).toHaveBeenLastCalledWith(false);
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });

    it('stays held between two jumps rather than flickering the banner on', () => {
      const { onRevealPending } = renderWithJumps(
        [],
        [jump({ seatID: '0' }), jump({ seatID: '1' })],
      );
      onRevealPending.mockClear();

      playOutOneJump();
      // Still one to go, so the chrome must never have been told to release.
      expect(onRevealPending).not.toHaveBeenCalledWith(false);
      expect(screen.getByTestId('balcony-overlay')).toBeInTheDocument();
    });

    it('releases when the viewer skips the rest', () => {
      const { onRevealPending } = renderWithJumps(
        [],
        [jump({ seatID: '0' }), jump({ seatID: '1' })],
      );
      fireEvent.click(screen.getByTestId('balcony-skip'));
      expect(onRevealPending).toHaveBeenLastCalledWith(false);
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });

    it('reports nothing pending to a viewer who arrived after the jump', () => {
      // The watermark starts at the number of jumps already there, so a late
      // joiner has no reveal owed and gets the result straight away rather
      // than being walked through a weekend they did not watch.
      const { onRevealPending } = renderWithJumps([jump()]);
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
      expect(onRevealPending).toHaveBeenLastCalledWith(false);
    });
  });

  describe('colour coding', () => {
    it('tags the phase chip with the venue, so the colour cannot drift from it', () => {
      for (const [phase, id] of [[0, 'tardeo'], [1, 'noche'], [2, 'after']] as const) {
        const { unmount } = renderBoard(makeG({ phase }));
        expect(screen.getByTestId('phase-chip')).toHaveAttribute('data-phase', id);
        unmount();
      }
    });

    it('colours a drink by what it does to you, not by the sign of the number', () => {
      // Pinta adds intoxication; agua is the only card that takes it away.
      const { unmount } = renderBoard(
        makeG({ lastDraw: { seatID: '0', alcohol: 'pinta', event: null, outcome: null } }),
      );
      const up = screen.getByTestId('card-pinta').querySelector('span[class*="intox"]')!;
      expect(up.className).toContain('intoxUp');
      unmount();

      renderBoard(makeG({ lastDraw: { seatID: '0', alcohol: 'agua', event: null, outcome: null } }));
      const down = screen.getByTestId('card-agua').querySelector('span[class*="intox"]')!;
      expect(down.className).toContain('intoxDown');
    });
  });

  describe('the draw reveal', () => {
    it('renders the alcohol card and its event (AC6)', () => {
      renderBoard(makeG({ lastDraw: { seatID: '1', alcohol: 'pinta', event: 'foto', outcome: null } }));
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
      renderBoard(makeG({ lastDraw: { seatID: '0', alcohol: 'cana', event: null, outcome: null } }));
      expect(screen.getByTestId('card-cana')).toBeInTheDocument();
      expect(screen.queryByTestId('event-facedown')).toBeNull();
    });

    it('prints a worked-out result under the cards, with seats resolved to names', () => {
      renderBoard(
        makeG({
          lastDraw: {
            seatID: '1',
            alcohol: 'pinta',
            event: 'foto',
            outcome: {
              key: 'magaluf.log.barraLibreResult',
              params: { actor: '1', vp: 3, n: 3 },
            },
          },
        }),
      );
      expect(screen.getByTestId('event-outcome')).toHaveTextContent('TEST_open_bar Bob 3 3');
    });

    it('resolves a list of winners to names', () => {
      renderBoard(
        makeG({
          lastDraw: {
            seatID: '0',
            alcohol: 'pinta',
            event: 'reyGuiri',
            outcome: {
              key: 'magaluf.log.reyGuiriResult',
              params: { winners: '0,2', n: 4, vp: 3 },
            },
          },
        }),
      );
      // The full standings are a second log entry, rendered by the feed only:
      // the card has room for the answer, not the table.
      expect(screen.getByTestId('event-outcome')).toHaveTextContent('TEST_king Alice, Carol 4 3');
    });

    it('qualifies names two seats are both using, as the chat feed does', () => {
      const G = makeG({
        lastDraw: {
          seatID: '0',
          alcohol: 'pinta',
          event: 'reyGuiri',
          outcome: {
            key: 'magaluf.log.reyGuiriResult',
            params: { winners: '0,1', n: 4, vp: 3 },
          },
        },
      });
      render(
        <MagalufBoard
          G={G}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          // Two people at the table have picked the same name -- "Alice, Alice"
          // names nobody.
          playerNames={{ '0': 'Alice', '1': 'Alice', '2': 'Carol' }}
        />,
      );

      const outcome = screen.getByTestId('event-outcome');
      expect(outcome).toHaveTextContent('TEST_seat_1');
      expect(outcome).toHaveTextContent('TEST_seat_2');
    });

    it('renders no outcome line for a card that is just its own numbers', () => {
      renderBoard(
        makeG({ lastDraw: { seatID: '0', alcohol: 'pinta', event: 'foto', outcome: null } }),
      );
      expect(screen.queryByTestId('event-outcome')).toBeNull();
    });

    it('shows the event face-down while it is still owed', () => {
      renderBoard(
        makeG({
          lastDraw: { seatID: '0', alcohol: 'pinta', event: null, outcome: null },
          pendingEvent: { seatID: '0', endsTurn: true },
        }),
      );
      expect(screen.getByTestId('card-pinta')).toBeInTheDocument();
      expect(screen.getByTestId('event-facedown')).toBeInTheDocument();
    });
  });

  describe('the event reveal step', () => {
    const pendingG = (seatID = '0') =>
      makeG({
        lastDraw: { seatID, alcohol: 'pinta', event: null, outcome: null },
        pendingEvent: { seatID, endsTurn: true },
      });

    it('offers only the reveal while an event is owed', () => {
      renderBoard(pendingG('0'), '0');
      expect(screen.getByTestId('reveal-event')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'TEST_drink' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'TEST_withdraw' })).toBeNull();
    });

    it('calls revealEvent', () => {
      const moves = { revealEvent: vi.fn() };
      render(
        <MagalufBoard
          G={pendingG('0')}
          ctx={makeCtx()}
          moves={moves as never}
          playerID="0"
          isActive
          playerNames={NAMES}
        />,
      );
      fireEvent.click(screen.getByTestId('reveal-event'));
      expect(moves.revealEvent).toHaveBeenCalledOnce();
    });

    it('offers nothing to a seat that does not owe the reveal', () => {
      renderBoard(pendingG('0'), '1');
      expect(screen.queryByTestId('action-bar')).toBeNull();
    });
  });

  describe('the event choice step', () => {
    // Vomitona: the flagship two-branch card. `endsTurn` matches what a plain
    // drink would have set, which is what the engine carries through.
    const choiceG = (seatID = '0') =>
      makeG({
        lastDraw: { seatID, alcohol: 'pinta', event: 'vomitona', outcome: null },
        pendingChoice: { seatID, eventId: 'vomitona', endsTurn: true },
      });

    it('replaces the whole move surface with the branches', () => {
      renderBoard(choiceG('0'), '0');
      expect(screen.getByTestId('event-choice')).toBeInTheDocument();
      expect(screen.getByTestId('choose-vomitar')).toBeInTheDocument();
      expect(screen.getByTestId('choose-aguantar')).toBeInTheDocument();
      // Nothing else is playable while a question is owed.
      expect(screen.queryByTestId('action-bar')).toBeNull();
      expect(screen.queryByRole('button', { name: 'TEST_drink' })).toBeNull();
    });

    it('passes the branch index the engine indexes by', () => {
      const { moves } = renderBoard(choiceG('0'), '0');
      fireEvent.click(screen.getByTestId('choose-aguantar'));
      expect(moves.chooseEventOption).toHaveBeenCalledWith(1);
    });

    it('keeps the drawn card face-up behind the question', () => {
      renderBoard(choiceG('0'), '0');
      // The player has to be able to read what they are choosing between.
      expect(screen.getByTestId('card-pinta')).toBeInTheDocument();
      expect(screen.queryByTestId('event-facedown')).toBeNull();
    });

    it('tells the rest of the table who they are waiting on', () => {
      renderBoard(choiceG('0'), '1');
      expect(screen.getByTestId('event-choice-waiting')).toHaveTextContent('Alice');
      expect(screen.queryByTestId('choose-vomitar')).toBeNull();
    });

    it('shows a spectator the same waiting line rather than nothing', () => {
      renderBoard(choiceG('0'), null, false);
      expect(screen.getByTestId('event-choice-waiting')).toBeInTheDocument();
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
    /**
     * The band used to widen across the weekend and this asserted that it did.
     * Since the deck was flattened it must do the opposite: an identical band
     * every day is what stops the meter rescaling overnight, and it still
     * carries nothing at all about which card was actually drawn.
     */
    it('shows the same public band on every day, and never the draw (AC14)', () => {
      const friday = renderBoard(makeG({ day: 0, limit: HIDDEN_LIMIT }));
      const fridayBand = screen.getByTestId('limit-chip-hidden').textContent;
      expect(fridayBand).toContain('16');
      expect(fridayBand).toContain('28');
      friday.unmount();

      renderBoard(makeG({ day: 2, limit: HIDDEN_LIMIT }));
      expect(screen.getByTestId('limit-chip-hidden').textContent).toBe(fridayBand);
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
      G.players['0']!.intox = 22; // d = 2 on a d6 -> 4/6 = 67%
      G.players['1']!.intox = 19; // under, no badge
      renderBoard(G);

      expect(screen.getByTestId('risk-0')).toHaveTextContent('67');
      expect(screen.queryByTestId('risk-1')).toBeNull();
    });
  });

  describe('the balcony overlay', () => {
    const jump = (over: Partial<JumpRecord> = {}): JumpRecord => ({
      day: 0,
      seatID: '1',
      d: 2,
      limit: 20,
      roll: 5,
      die: 6,
      survived: true,
      legendVP: 5,
      poolVP: 12,
      lostVP: 0,
      bankedVP: 12,
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
      expect(screen.getByTestId('balcony-odds')).toHaveTextContent('67');
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

      // Before the roll the pool is at stake, not gone: the first beat says
      // what is riding on it and never says it was lost.
      expect(screen.getByText('TEST_at_risk 12')).toBeInTheDocument();
      expect(screen.queryByTestId('balcony-lost')).toBeNull();

      fireEvent.click(screen.getByTestId('balcony-jump'));
      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_pool');
      expect(screen.getByText('TEST_pool_body Bob 5')).toBeInTheDocument();
      // The night is banked, not forfeited.
      expect(screen.getByTestId('balcony-banked')).toHaveTextContent('TEST_banked 12');
      expect(screen.queryByTestId('balcony-lost')).toBeNull();
    });

    it('distinguishes the concrete (AC21)', () => {
      const G = makeG();
      const { rerender } = renderBoard(G);
      rerender(
        <MagalufBoard
          G={{ ...G, jumps: [jump({ survived: false, legendVP: 0, lostVP: 12, bankedVP: 0 })] }}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={NAMES}
        />,
      );

      fireEvent.click(screen.getByTestId('balcony-jump'));
      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_concrete');
      // Only the concrete costs the night.
      expect(screen.getByTestId('balcony-lost')).toHaveTextContent('TEST_lost 12');
      expect(screen.queryByTestId('balcony-banked')).toBeNull();
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

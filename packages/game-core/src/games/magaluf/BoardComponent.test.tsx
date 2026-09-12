// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { MagalufBoard } from './BoardComponent.js';
import type { CardInstance } from './cards.js';
import { PHASE_RULES } from './constants.js';
import { HIDDEN_LIMIT } from './gameDef.js';
import { DEFAULT_SETTINGS } from './settings.js';
import {
  newPlayer,
  type JumpRecord,
  type MagalufG,
  type MagalufPlayer,
  type PendingDuel,
} from './state.js';

const NAMES = { '0': 'Alice', '1': 'Bob', '2': 'Carol' };

/**
 * A printed card from a bare id. Board tests care which card is on the table,
 * not which printing of it, so everything defaults to the first.
 */
function card<T extends string>(id: T, variant = 0): CardInstance<T> {
  return { id, variant };
}

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
    pendingDuel: null,
    cierrabares: null,
    pendingAdvance: null,
    roundConfirm: null,
    hostPlayerID: null,
    jumps: [],
    balcony: null,
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
    chooseDuelTarget: vi.fn(),
    duelDrink: vi.fn(),
    duelFold: vi.fn(),
    revealJump: vi.fn(),
    advanceJump: vi.fn(),
    skipBalcony: vi.fn(),
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

    it('describes every item it holds, so the rules are readable off the panel', () => {
      const G = makeG();
      G.players['1']!.items = ['kebab', 'farlopa'];
      renderBoard(G, '0');

      // Reached by pointing at the chip, so it has to be the chip's own
      // accessible description rather than text loose in the panel.
      expect(screen.getByTestId('item-1-kebab')).toHaveAccessibleDescription(
        'TEST_kebab_rules',
      );
      expect(screen.getByTestId('item-1-farlopa')).toHaveAccessibleDescription(
        'TEST_cocaine_rules',
      );
    });

    it('prints the short effect on the action bar button (not the full rules)', () => {
      const G = makeG();
      G.players['0']!.items = ['botella'];
      renderBoard(G, '0');

      const button = screen.getByTestId('use-botella');
      expect(button).toHaveTextContent('TEST_use TEST_water (TEST_water_short)');
      expect(button).not.toHaveTextContent('TEST_water_rules');
    });
  });

  describe('the phase header', () => {
    /**
     * Read straight off PHASE_RULES rather than hardcoded here: the point of
     * the chip is that the table never has to remember these two numbers, so
     * the test must fail if the chip and the rules ever disagree.
     */
    it('prints the current venue’s drink minimum and maximum', () => {
      for (const [phase, id] of [[0, 'tardeo'], [1, 'noche'], [2, 'after']] as const) {
        // Pinned to -1: maxDrinksOverride now defaults to unlimited (0) for
        // the ongoing playtest, and this test is about the tuned numbers
        // themselves, not that default -- see the override's own test below.
        const { unmount } = renderBoard(
          makeG({ phase, settings: { ...DEFAULT_SETTINGS, maxDrinksOverride: -1 } }),
        );
        const rules = PHASE_RULES[id];
        expect(screen.getByTestId('phase-drinks-chip')).toHaveTextContent(
          `TEST_phase_drinks ${rules.minDrinks} ${rules.maxDrinks}`,
        );
        unmount();
      }
    });

    it('shows ∞ instead of a number once the host removes the cap', () => {
      const { unmount } = renderBoard(makeG({ settings: { ...DEFAULT_SETTINGS, maxDrinksOverride: 0 } }));
      expect(screen.getByTestId('phase-drinks-chip')).toHaveTextContent(
        `TEST_phase_drinks ${PHASE_RULES.tardeo.minDrinks} ∞`,
      );
      unmount();
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
        makeG({ lastDraw: { seatID: '0', alcohol: card('pinta'), event: null, outcome: null, pours: [] } }),
      );
      const up = screen.getByTestId('card-pinta').querySelector('span[class*="intox"]')!;
      expect(up.className).toContain('intoxUp');
      unmount();

      renderBoard(makeG({ lastDraw: { seatID: '0', alcohol: card('agua'), event: null, outcome: null, pours: [] } }));
      const down = screen.getByTestId('card-agua').querySelector('span[class*="intox"]')!;
      expect(down.className).toContain('intoxDown');
    });
  });

  /**
   * A card is four things stacked in a fixed order: what it is called, a
   * picture, what it does, and a line that does nothing. The first and third
   * are what make two copies the same card; the second and fourth are what
   * make them different objects.
   */
  describe('the printed card', () => {
    const drawn = (alcohol: CardInstance<string>, event: CardInstance<string> | null = null) =>
      makeG({ lastDraw: { seatID: '0', alcohol, event: event as never, outcome: null, pours: [] } });

    it('lays out title, art, effect and flavour', () => {
      renderBoard(drawn(card('pinta')));

      expect(screen.getByTestId('card-title-pinta')).toHaveTextContent('TEST_pint');
      expect(screen.getByTestId('card-effect-pinta')).toBeInTheDocument();
      expect(screen.getByTestId('card-flavor-pinta')).toHaveTextContent('TEST_pint_flavor_a');
      expect(screen.getByTestId('card-art-pinta-0')).toHaveAttribute(
        'src',
        '/cards/magaluf/pinta01.png',
      );
    });

    /**
     * No artwork ships yet, so in practice every card takes this path in the
     * running app. jsdom never loads an image and never fires `error` on its
     * own, so the failure is fired by hand -- the assertion is about what the
     * player sees when a file is not there, not about jsdom's network behaviour.
     */
    it('shows the file it is waiting for when the art is missing', () => {
      renderBoard(drawn(card('pinta')));
      fireEvent.error(screen.getByTestId('card-art-pinta-0'));

      const placeholder = screen.getByTestId('card-art-missing-pinta-0');
      expect(placeholder).toHaveTextContent('pinta01.png');
      // Just the filename: the title is already rendered directly above it,
      // and every card is in this state until artwork ships.
      expect(placeholder).not.toHaveTextContent('TEST_pint');
    });

    it('fills the effect from the card data, not from the sentence', () => {
      // Pinta is 2 intoxication and 2 VP in `cards.ts`; the translation only
      // ever says `{{intox}}` and `{{vp}}`, so these numbers cannot drift from
      // the values the engine actually applies.
      const effect = renderBoard(drawn(card('pinta'))) && screen.getByTestId('card-effect-pinta');
      expect(effect).toHaveTextContent('+2');
      cleanup();

      renderBoard(drawn(card('pecera')));
      expect(screen.getByTestId('card-effect-pecera')).toHaveTextContent('+6');
      expect(screen.getByTestId('card-effect-pecera')).toHaveTextContent('+10');
    });

    it('signs a penalty with a minus rather than a plus', () => {
      renderBoard(drawn(card('agua')));
      expect(screen.getByTestId('card-effect-agua')).toHaveTextContent('−1');
    });

    /** The whole point of feature 042. */
    it('gives two copies of one card the same face and a different soul', () => {
      renderBoard(drawn(card('cana', 0)));
      const first = {
        title: screen.getByTestId('card-title-cana').textContent,
        effect: screen.getByTestId('card-effect-cana').textContent,
        flavor: screen.getByTestId('card-flavor-cana').textContent,
        art: screen.getByTestId('card-art-cana-0').getAttribute('src'),
      };
      cleanup();

      renderBoard(drawn(card('cana', 1)));
      // The same card...
      expect(screen.getByTestId('card-title-cana').textContent).toBe(first.title);
      expect(screen.getByTestId('card-effect-cana').textContent).toBe(first.effect);
      // ...and a different object.
      expect(screen.getByTestId('card-flavor-cana').textContent).not.toBe(first.flavor);
      const art = screen.getByTestId('card-art-cana-1').getAttribute('src');
      expect(art).not.toBe(first.art);
      expect(art).toBe('/cards/magaluf/cana02.png');
    });

    it('falls back to the first printing when a copy has no line of its own', () => {
      // Pecera carries one flavour line in the fixture but is asked for its
      // third printing. A gap in the catalogue is not a broken card.
      renderBoard(drawn(card('pecera', 2)));
      expect(screen.getByTestId('card-flavor-pecera')).toHaveTextContent('TEST_pecera_flavor_a');
    });

    it('renders an event card with the same anatomy', () => {
      renderBoard(drawn(card('pinta'), card('foto', 1)));
      expect(screen.getByTestId('card-title-foto')).toHaveTextContent('TEST_photo');
      expect(screen.getByTestId('card-flavor-foto')).toHaveTextContent('TEST_photo_flavor_b');
      expect(screen.getByTestId('card-art-foto-1')).toHaveAttribute(
        'src',
        '/cards/magaluf/foto02.png',
      );
    });
  });

  describe('the draw reveal', () => {
    it('renders the alcohol card and its event (AC6)', () => {
      renderBoard(makeG({ lastDraw: { seatID: '1', alcohol: card('pinta'), event: card('foto'), outcome: null, pours: [] } }));
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
      renderBoard(makeG({ lastDraw: { seatID: '0', alcohol: card('cana'), event: null, outcome: null, pours: [] } }));
      expect(screen.getByTestId('card-cana')).toBeInTheDocument();
      expect(screen.queryByTestId('event-facedown')).toBeNull();
    });

    it('prints a worked-out result under the cards, with seats resolved to names', () => {
      renderBoard(
        makeG({
          lastDraw: {
            seatID: '1',
            alcohol: card('pinta'),
            event: card('foto'),
            outcome: {
              key: 'magaluf.log.barraLibreResult',
              params: { actor: '1', vp: 3, n: 3 },
            },
            pours: [],
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
            alcohol: card('pinta'),
            event: card('remontada'),
            outcome: {
              key: 'magaluf.log.remontadaResult',
              params: { winners: '0,2', n: 4, vp: 3 },
            },
            pours: [],
          },
        }),
      );
      // The full standings are a second log entry, rendered by the feed only:
      // the card has room for the answer, not the table.
      expect(screen.getByTestId('event-outcome')).toHaveTextContent('TEST_comeback Alice, Carol 4 3');
    });

    it('qualifies names two seats are both using, as the chat feed does', () => {
      const G = makeG({
        lastDraw: {
          seatID: '0',
          alcohol: card('pinta'),
          event: card('remontada'),
          outcome: {
            key: 'magaluf.log.remontadaResult',
            params: { winners: '0,1', n: 4, vp: 3 },
          },
          pours: [],
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
        makeG({ lastDraw: { seatID: '0', alcohol: card('pinta'), event: card('foto'), outcome: null, pours: [] } }),
      );
      expect(screen.queryByTestId('event-outcome')).toBeNull();
    });

    it('shows the event face-down while it is still owed', () => {
      renderBoard(
        makeG({
          lastDraw: { seatID: '0', alcohol: card('pinta'), event: null, outcome: null, pours: [] },
          pendingEvent: { seatID: '0', endsTurn: true },
        }),
      );
      expect(screen.getByTestId('card-pinta')).toBeInTheDocument();
      expect(screen.getByTestId('event-facedown')).toBeInTheDocument();
    });
  });

  /**
   * A Ronda buys the whole venue a round and a Chupito de la casa buys the
   * drawer one more. Those cards used to arrive as intoxication that had
   * already moved, with the only record three lines deep in the chat feed.
   */
  describe('the drinks a card pours', () => {
    const rondaDraw = () =>
      makeG({
        lastDraw: {
          seatID: '0',
          alcohol: card('pinta'),
          event: card('ronda'),
          outcome: null,
          pours: [
            { seatID: '0', alcohol: card('cana'), intox: 1, vp: 1 },
            { seatID: '1', alcohol: card('pecera'), intox: 6, vp: 5 },
            { seatID: '2', alcohol: card('cana'), intox: 1, vp: 1 },
          ],
        },
      });

    it('deals one tile per drinker, named, with the numbers they took', () => {
      renderBoard(rondaDraw());

      const poured = screen.getByTestId('poured-drinks');
      expect(poured).toHaveTextContent('TEST_poured');
      for (const [seat, name] of [['0', 'Alice'], ['1', 'Bob'], ['2', 'Carol']] as const) {
        expect(screen.getByTestId(`poured-${seat}`)).toHaveTextContent(name);
      }
      // Bob's fishbowl carries its own numbers, not the drawer's pinta's.
      expect(poured).toHaveTextContent('TEST_fishbowl');
      expect(poured).toHaveTextContent('TEST_int 6');
      expect(poured).toHaveTextContent('TEST_vp 5');
    });

    it('keeps the round separate from the pair that caused it', () => {
      renderBoard(rondaDraw());

      // The drawer's own pinta is the headline and stays outside the round --
      // otherwise the same drink reads as two.
      const poured = screen.getByTestId('poured-drinks');
      expect(poured).not.toHaveTextContent('TEST_pint');
      expect(screen.getByTestId('card-pinta')).toBeInTheDocument();
    });

    it('renders nothing at all for a card that pours no drinks', () => {
      renderBoard(
        makeG({ lastDraw: { seatID: '0', alcohol: card('pinta'), event: card('foto'), outcome: null, pours: [] } }),
      );
      expect(screen.queryByTestId('poured-drinks')).toBeNull();
    });

    it('qualifies a name two seats are both using, as the outcome line does', () => {
      render(
        <MagalufBoard
          G={rondaDraw()}
          ctx={makeCtx()}
          moves={{} as never}
          playerID="0"
          isActive
          playerNames={{ '0': 'Alice', '1': 'Alice', '2': 'Carol' }}
        />,
      );
      expect(screen.getByTestId('poured-0')).toHaveTextContent('TEST_seat_1');
      expect(screen.getByTestId('poured-1')).toHaveTextContent('TEST_seat_2');
    });
  });

  describe('the event reveal step', () => {
    const pendingG = (seatID = '0') =>
      makeG({
        lastDraw: { seatID, alcohol: card('pinta'), event: null, outcome: null, pours: [] },
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
        lastDraw: { seatID, alcohol: card('pinta'), event: card('vomitona'), outcome: null, pours: [] },
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

    it('asks before the Camello hands anything over', () => {
      // The contraband cards go through the same panel as any other question,
      // so nobody is holding on a Redada without having pressed a button.
      renderBoard(
        makeG({
          lastDraw: {
            seatID: '0',
            alcohol: card('pinta'),
            event: card('camelloFarlopa'),
            outcome: null,
            pours: [],
          },
          pendingChoice: { seatID: '0', eventId: 'camelloFarlopa', endsTurn: true },
        }),
        '0',
      );
      expect(screen.getByTestId('choose-pillarFarlopa')).toHaveTextContent('TEST_take_the_coke');
      expect(screen.getByTestId('choose-dejarlo')).toHaveTextContent('TEST_leave_it');
    });
  });

  describe('the duel', () => {
    // A Noche duel between Alice (0) and Carol (2), waiting on Carol.
    const duelG = (duel: Partial<PendingDuel> = {}, overrides: Partial<MagalufG> = {}) =>
      makeG({
        lastDraw: {
          seatID: '0',
          alcohol: card('pinta'),
          event: card('dueloNoche'),
          outcome: null,
          pours: [],
        },
        pendingDuel: {
          challengerID: '0',
          targetID: '2',
          toActID: '2',
          eventId: 'dueloNoche',
          drinks: 0,
          overCap: [],
          endsTurn: true,
          ...duel,
        },
        ...overrides,
      });

    it('asks the challenger to pick from the seats still in the room', () => {
      const G = duelG(
        { targetID: null, toActID: null },
        { players: { '0': player(), '1': player({ status: 'withdrawn' }), '2': player() } },
      );
      const { moves } = renderBoard(G, '0');
      expect(screen.getByTestId('duel-target-2')).toHaveTextContent('Carol');
      expect(screen.queryByTestId('duel-target-1')).toBeNull();
      expect(screen.queryByTestId('duel-target-0')).toBeNull();
      expect(screen.queryByTestId('action-bar')).toBeNull();

      fireEvent.click(screen.getByTestId('duel-target-2'));
      expect(moves.chooseDuelTarget).toHaveBeenCalledWith('2');
    });

    it('tells the rest of the table who is choosing', () => {
      renderBoard(duelG({ targetID: null, toActID: null }), '1');
      expect(screen.getByTestId('duel-waiting-target')).toHaveTextContent('TEST_duel_choosing Alice');
      expect(screen.queryByTestId(/^duel-target-/)).toBeNull();
    });

    it('shows both duelists, the pot, and what one more drink makes it', () => {
      renderBoard(duelG({ drinks: 3, toActID: '0' }), '1');
      expect(screen.getByTestId('duel-vs')).toHaveTextContent('TEST_duel Alice Carol');
      // Noche pays 2 to open and 2 a drink: 2 × (3 + 1), then 2 × (4 + 1).
      expect(screen.getByTestId('duel-pot')).toHaveTextContent('TEST_pot 8');
      expect(screen.getByTestId('duel-next-pot')).toHaveTextContent('TEST_next_pot 10');
    });

    it('gives the buttons to the duelist it is waiting on, and only them', () => {
      const { moves } = renderBoard(duelG(), '2');
      fireEvent.click(screen.getByTestId('duel-drink'));
      expect(moves.duelDrink).toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('duel-fold'));
      expect(moves.duelFold).toHaveBeenCalled();
      cleanup();

      // The challenger, a bystander and a spectator all wait -- and the turn
      // seat's action bar stays away even though it is seat 0's turn.
      for (const seat of ['0', '1', null]) {
        renderBoard(duelG(), seat, seat !== null);
        expect(screen.queryByTestId('duel-drink')).toBeNull();
        expect(screen.getByTestId('duel-waiting')).toHaveTextContent('TEST_duel_deciding Carol');
        expect(screen.queryByTestId('action-bar')).toBeNull();
        cleanup();
      }
    });

    it('leaves the result pinned under the Duelo once it is over', () => {
      renderBoard(
        makeG({
          lastDraw: {
            seatID: '0',
            alcohol: card('pinta'),
            event: card('dueloNoche'),
            outcome: { key: 'magaluf.log.duelResult', params: { actor: '2', n: 3, vp: 8 } },
            pours: [],
          },
        }),
      );
      expect(screen.getByTestId('event-outcome')).toHaveTextContent('TEST_duel_result Carol 3 8');
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

  describe('the cierrabares banner', () => {
    it('names who closed the bar, on what, and for how much', () => {
      renderBoard(makeG({ cierrabares: { seatID: '1', drinks: 5, vp: 6 } }));

      expect(screen.getByTestId('cierrabares-banner')).toBeTruthy();
      expect(screen.getByText('TEST_cierrabares_won Bob 5 6')).toBeTruthy();
    });

    /**
     * Null covers two different things — mid-phase, and a phase whose drink
     * count tied — and neither of them is an award to show. The tie gets a log
     * line instead, which is the right weight for a non-event.
     */
    it('shows nothing at all when there is no award', () => {
      renderBoard(makeG({ cierrabares: null }));
      expect(screen.queryByTestId('cierrabares-banner')).toBeNull();
    });
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

  /**
   * The overlay reads `G.balcony`, so every seat is on the same beat of the
   * same jump, and only the seat on the railing gets buttons. It used to pace
   * itself per viewer, which let anyone who clicked quickly read the night's
   * whole death toll before the jumpers had looked at their own.
   */
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

    /** A table stood at `jumps[index]`, seen from `viewer`'s seat. */
    const atBalcony = (
      jumps: JumpRecord[],
      { index = 0, revealed = false, viewer = '0' as string | null, host = null as string | null } = {},
    ) => renderBoard(makeG({ jumps, balcony: { index, revealed }, hostPlayerID: host }), viewer);

    it('renders nothing while the table is not at a balcony (AC23)', () => {
      // Jumps in the log with no balcony open is every moment except the
      // reveal itself -- including a viewer who joined after the weekend's.
      renderBoard(makeG({ jumps: [jump(), jump({ seatID: '2' })] }));
      expect(screen.queryByTestId('balcony-overlay')).toBeNull();
    });

    /**
     * The instruction has to agree with the badge beside it. Past `d = die` no
     * roll beats `d` and only the top face clears, so "you need more than 49"
     * printed next to a 17% chance reads as a death sentence for a jump that
     * is still live.
     */
    describe('what it tells you to roll', () => {
      it('names the number to beat while beating it is possible', () => {
        atBalcony([jump({ d: 2, die: 6 })]);
        expect(screen.getByTestId('balcony-target')).toHaveTextContent('TEST_target d6 over 2');
      });

      it('names the top face once that is the only thing left', () => {
        atBalcony([jump({ d: 49, die: 6 })]);
        expect(screen.getByTestId('balcony-target')).toHaveTextContent('TEST_target_max d6');
        // And the odds it sits next to are the floor, not zero.
        expect(screen.getByTestId('balcony-odds')).toHaveTextContent('17');
      });

      it('switches over exactly at d === die', () => {
        atBalcony([jump({ d: 5, die: 6 })]);
        expect(screen.getByTestId('balcony-target')).toHaveTextContent('TEST_target d6 over 5');
        cleanup();
        atBalcony([jump({ d: 6, die: 6 })]);
        expect(screen.getByTestId('balcony-target')).toHaveTextContent('TEST_target_max d6');
      });
    });

    it('shows the odds but not the outcome before the die is turned (AC20)', () => {
      atBalcony([jump()]);
      expect(screen.getByTestId('balcony-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('balcony-odds')).toHaveTextContent('67');
      expect(screen.queryByTestId('balcony-outcome')).toBeNull();
      // The seat that was up when the venue closed keeps no live action bar
      // underneath the overlay -- the night is over, there is nothing to drink.
      expect(screen.queryByTestId('action-bar')).toBeNull();
    });

    it('reveals pool with the legend bonus on the second beat (AC21)', () => {
      const jumps = [jump({ survived: true, legendVP: 5 })];
      const { unmount } = atBalcony(jumps);

      // Before the roll the pool is at stake, not gone: the first beat says
      // what is riding on it and never says it was lost.
      expect(screen.getByText('TEST_at_risk 12')).toBeInTheDocument();
      expect(screen.queryByTestId('balcony-lost')).toBeNull();
      unmount();

      atBalcony(jumps, { revealed: true });
      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_pool');
      expect(screen.getByText('TEST_pool_body Bob 5')).toBeInTheDocument();
      // The night is banked, not forfeited.
      expect(screen.getByTestId('balcony-banked')).toHaveTextContent('TEST_banked 12');
      expect(screen.queryByTestId('balcony-lost')).toBeNull();
    });

    it('distinguishes the concrete (AC21)', () => {
      atBalcony([jump({ survived: false, legendVP: 0, lostVP: 12, bankedVP: 0 })], {
        revealed: true,
      });

      expect(screen.getByTestId('balcony-outcome')).toHaveTextContent('TEST_concrete');
      // Only the concrete costs the night.
      expect(screen.getByTestId('balcony-lost')).toHaveTextContent('TEST_lost 12');
      expect(screen.queryByTestId('balcony-banked')).toBeNull();
    });

    it('shows every seat the same jump, from the same index (AC22)', () => {
      const jumps = [jump({ seatID: '1' }), jump({ seatID: '2' })];
      for (const viewer of ['0', '1', '2', null]) {
        const { unmount } = atBalcony(jumps, { index: 1, viewer });
        // Carol's, for everyone -- nobody is a jump ahead of anybody else.
        expect(screen.getByText('TEST_balcony_body Carol 2')).toBeInTheDocument();
        unmount();
      }
    });

    it('gives the buttons to the jumper alone, and wires them to the moves', () => {
      const { moves } = atBalcony([jump({ seatID: '1' })], { viewer: '1' });

      fireEvent.click(screen.getByTestId('balcony-jump'));
      expect(moves.revealJump).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('balcony-waiting')).toBeNull();
    });

    it('gives a watcher the waiting line instead of the jump button', () => {
      atBalcony([jump({ seatID: '1' })], { viewer: '0' });

      expect(screen.queryByTestId('balcony-jump')).toBeNull();
      expect(screen.getByTestId('balcony-waiting')).toHaveTextContent('TEST_on_railing Bob');
    });

    it('keeps continue with the jumper once the die is face-up', () => {
      const mine = atBalcony([jump({ seatID: '1' })], { revealed: true, viewer: '1' });
      fireEvent.click(screen.getByTestId('balcony-continue'));
      expect(mine.moves.advanceJump).toHaveBeenCalledOnce();
      mine.unmount();

      atBalcony([jump({ seatID: '1' })], { revealed: true, viewer: '0' });
      expect(screen.queryByTestId('balcony-continue')).toBeNull();
      expect(screen.getByTestId('balcony-waiting')).toHaveTextContent('TEST_waiting_jumper Bob');
    });

    it('shows a spectator the jump and no controls at all', () => {
      renderBoard(
        makeG({ jumps: [jump()], balcony: { index: 0, revealed: false } }),
        null,
        false,
      );
      expect(screen.getByTestId('balcony-overlay')).toBeInTheDocument();
      expect(screen.queryByTestId('balcony-jump')).toBeNull();
      expect(screen.queryByTestId('balcony-skip')).toBeNull();
    });

    it('offers the skip to the host only, as the escape hatch it is', () => {
      const jumps = [jump({ seatID: '1' })];

      const guest = atBalcony(jumps, { viewer: '0', host: '2' });
      expect(screen.queryByTestId('balcony-skip')).toBeNull();
      guest.unmount();

      const { moves } = atBalcony(jumps, { viewer: '2', host: '2' });
      fireEvent.click(screen.getByTestId('balcony-skip'));
      expect(moves.skipBalcony).toHaveBeenCalledOnce();
    });
  });
});

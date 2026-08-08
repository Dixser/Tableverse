/**
 * Rule-level invariants.
 *
 * The simulator already exercises structure across tens of thousands of games;
 * these tests pin the specific rules that are easy to break silently and that
 * the design actually rests on.
 *
 *   npx vitest run --root prototypes/magaluf
 */

import { describe, expect, it } from 'vitest';

import type { EventId, ItemId } from './cards.ts';
import { EVENTS } from './cards.ts';
import type { Config } from './config.ts';
import { cloneConfig, defaultConfig } from './config.ts';
import { applyAction, createGame, currentPlayer } from './engine.ts';
import type { GameState } from './state.ts';

// ---------------------------------------------------------------------------
// Deterministic fixtures
// ---------------------------------------------------------------------------

/**
 * A config with no randomness left in the decks: every alcohol card and every
 * event card is the same one, so a test asserts about rules rather than luck.
 */
function fixedConfig(alcohol: string, event: EventId, overrides: (c: Config) => void = () => {}): Config {
  const config = cloneConfig(defaultConfig);
  config.playerCount = 3;
  for (const phase of ['tardeo', 'noche', 'after'] as const) {
    config.phases[phase].alcohol = { [alcohol]: 40 };
    config.phases[phase].events = { [event]: 40 } as Partial<Record<EventId, number>>;
  }
  overrides(config);
  return config;
}

/**
 * As above, but with exit penalties and last-standing bonuses switched off.
 *
 * Tests that assert an exact VP total need the round pool to hold still while
 * the game is walked forward; otherwise the After's −5 aguafiestas penalty
 * silently edits the number under test.
 */
function noFrictionConfig(
  alcohol: string,
  event: EventId,
  overrides: (c: Config) => void = () => {},
): Config {
  return fixedConfig(alcohol, event, (c) => {
    for (const phase of ['tardeo', 'noche', 'after'] as const) {
      c.phases[phase].earlyExitPenalty = 0;
      c.phases[phase].lastStandingBonus = 0;
    }
    overrides(c);
  });
}

/** Everyone withdraws immediately, which walks the game forward a phase at a time. */
function withdrawAll(state: GameState, config: Config, until: () => boolean): void {
  let guard = 0;
  while (!state.over && !until()) {
    if (++guard > 5000) throw new Error('withdrawAll did not reach its stopping condition');
    if (!currentPlayer(state)) break;
    applyAction(state, config, { type: 'withdraw' });
  }
}

function atPhase(state: GameState, day: number, phase: number): () => boolean {
  return () => state.day === day && state.phase === phase;
}

// ---------------------------------------------------------------------------

describe('resaca', () => {
  it('sets the morning intoxication floor while everything else resets', () => {
    const config = fixedConfig('cana', 'nada');
    const state = createGame(config, 1);

    state.players[0]!.resaca = 5;
    withdrawAll(state, config, atPhase(state, 1, 0));

    expect(state.day).toBe(1);
    expect(state.players[0]!.intox).toBe(5);
    expect(state.players[1]!.intox).toBe(0);
    expect(state.players[0]!.roundVP).toBe(0);
  });

  it('accumulates across days and is never cleared', () => {
    const config = fixedConfig('cana', 'nada');
    const state = createGame(config, 2);

    state.players[0]!.resaca = 2;
    withdrawAll(state, config, atPhase(state, 1, 0));
    state.players[0]!.resaca += 3;
    withdrawAll(state, config, atPhase(state, 2, 0));

    expect(state.players[0]!.resaca).toBe(5);
    expect(state.players[0]!.intox).toBe(5);
  });
});

describe('balconing', () => {
  it('costs the round pool only when the roll fails', () => {
    for (const basePoolChance of [1, 0]) {
      const config = noFrictionConfig('cana', 'nada', (c) => {
        c.balconing.basePoolChance = basePoolChance;
      });
      const state = createGame(config, 3);

      withdrawAll(state, config, atPhase(state, 0, 2));
      const victim = state.players[0]!;
      victim.roundVP = 40;
      victim.intox = state.limit + 2;
      withdrawAll(state, config, () => state.day !== 0);

      const jump = state.jumps.at(0)!;
      expect(jump.poolVP).toBe(40);
      expect(jump.survived).toBe(basePoolChance === 1);

      if (jump.survived) {
        // Friday is x1, so the pool banks at face value — with the legend
        // bonus on top of it rather than instead of it.
        expect(jump.lostVP).toBe(0);
        expect(jump.bankedVP).toBe(40);
        expect(victim.bankedVP).toBe(40 + jump.legendVP);
      } else {
        expect(jump.lostVP).toBe(40);
        expect(jump.bankedVP).toBe(0);
        expect(victim.bankedVP).toBe(0);
      }
    }
  });

  it('pays the legend bonus and a resaca to survivors, and kills the rest', () => {
    const survivor = noFrictionConfig('cana', 'nada', (c) => {
      c.balconing.basePoolChance = 1;
    });
    const state = createGame(survivor, 4);
    withdrawAll(state, survivor, atPhase(state, 0, 2));
    state.players[0]!.intox = state.limit + 3;
    withdrawAll(state, survivor, () => state.day !== 0);

    expect(state.players[0]!.status).not.toBe('dead');
    expect(state.players[0]!.bankedVP).toBe(survivor.balconing.legendBase + 3);
    expect(state.players[0]!.resaca).toBe(survivor.balconing.resaca);

    const doomed = noFrictionConfig('cana', 'nada', (c) => {
      c.balconing.basePoolChance = 0;
    });
    const dead = createGame(doomed, 5);
    withdrawAll(dead, doomed, atPhase(dead, 0, 2));
    dead.players[0]!.intox = dead.limit + 3;
    withdrawAll(dead, doomed, () => dead.day !== 0);

    expect(dead.players[0]!.status).toBe('dead');
    expect(dead.players[0]!.resaca).toBe(0);
  });

  it('never triggers at or below the limit', () => {
    const config = noFrictionConfig('cana', 'nada');
    const state = createGame(config, 6);
    withdrawAll(state, config, atPhase(state, 0, 2));
    state.players[0]!.intox = state.limit; // exactly at it
    state.players[0]!.roundVP = 12;
    withdrawAll(state, config, () => state.day !== 0);

    expect(state.jumps).toHaveLength(0);
    expect(state.players[0]!.bankedVP).toBe(12);
  });
});

describe('arrest', () => {
  it('banks the round, ends the day, and cancels that night’s limit check', () => {
    const config = fixedConfig('cana', 'redada');
    const state = createGame(config, 7);

    const player = currentPlayer(state)!;
    player.items = ['porro' as ItemId];
    player.roundVP = 10;
    applyAction(state, config, { type: 'drink' });

    expect(player.status).toBe('arrested');
    // 10 already there, +1 for the caña drunk on the way in, at Friday's rate.
    expect(player.bankedVP).toBe(11);
    expect(player.roundVP).toBe(0);

    // Even parked well over the limit, a night in the cells is not a jump.
    player.intox = state.limit + 6;
    withdrawAll(state, config, () => state.day !== 0);
    expect(state.jumps).toHaveLength(0);
    expect(player.status).not.toBe('dead');
  });

  it('does nothing at all when nobody is holding contraband', () => {
    const config = fixedConfig('cana', 'redada');
    const state = createGame(config, 8);

    const player = currentPlayer(state)!;
    applyAction(state, config, { type: 'drink' });

    expect(player.status).toBe('partying');
    expect(state.stats.redadasThatDidNothing).toBe(1);
  });
});

describe('leaving a phase', () => {
  it('charges the aguafiestas penalty below the drink minimum but not at it', () => {
    // Last-standing is switched off so the only thing that can move the round
    // pool here is the penalty: the player who meets the minimum is also, by
    // construction, the last one out and would otherwise collect the bonus.
    const config = fixedConfig('agua', 'nada', (c) => {
      c.phases.tardeo.lastStandingBonus = 0;
    });
    const state = createGame(config, 9);
    const min = config.phases.tardeo.minDrinks;
    const penalty = config.phases.tardeo.earlyExitPenalty;

    const quitter = currentPlayer(state)!;
    applyAction(state, config, { type: 'withdraw' });
    expect(quitter.roundVP).toBe(-penalty);

    // Each action passes the turn on, so drive the table until this one player
    // has met the minimum rather than acting twice in a row.
    const stayer = currentPlayer(state)!;
    let guard = 0;
    while (stayer.drinksThisPhase < min && ++guard < 100) {
      const active = currentPlayer(state)!;
      applyAction(state, config, active.id === stayer.id ? { type: 'drink' } : { type: 'withdraw' });
    }
    while (currentPlayer(state)!.id !== stayer.id) applyAction(state, config, { type: 'withdraw' });

    const before = stayer.roundVP;
    applyAction(state, config, { type: 'withdraw' });
    expect(stayer.roundVP).toBe(before);
  });

  it('does not charge the penalty to an arrested player', () => {
    const config = fixedConfig('cana', 'redada');
    const state = createGame(config, 10);
    const player = currentPlayer(state)!;
    player.items = ['farlopa' as ItemId];

    applyAction(state, config, { type: 'drink' });

    expect(player.status).toBe('arrested');
    expect(state.stats.earlyExits).toBe(0);
  });
});

describe('ultimo en pie', () => {
  it('is withheld from a last player who did not meet the drink minimum', () => {
    const config = fixedConfig('agua', 'nada');
    const state = createGame(config, 11);
    const bonus = config.phases.tardeo.lastStandingBonus;

    // Everyone leaves without drinking, so the last one out earns nothing.
    withdrawAll(state, config, () => state.phase !== 0);
    for (const p of state.players) {
      expect(p.roundVP).toBe(-config.phases.tardeo.earlyExitPenalty);
      expect(p.roundVP).not.toBe(bonus - config.phases.tardeo.earlyExitPenalty);
    }
  });

  it('is paid to the last player out once they have met the minimum', () => {
    const config = fixedConfig('agua', 'nada');
    const state = createGame(config, 12);
    const min = config.phases.tardeo.minDrinks;
    const bonus = config.phases.tardeo.lastStandingBonus;

    const survivor = state.players[0]!;
    let guard = 0;
    while (state.phase === 0 && !state.over && ++guard < 200) {
      const active = currentPlayer(state);
      if (!active) break;
      if (active.id === survivor.id && active.drinksThisPhase < min) {
        applyAction(state, config, { type: 'drink' });
      } else {
        applyAction(state, config, { type: 'withdraw' });
      }
    }

    // Agua is worth 0 VP, so the bonus is the only thing in the pool.
    expect(survivor.roundVP).toBe(bonus);
  });
});

describe('items', () => {
  it('the joint passes the turn without withdrawing or counting as a drink', () => {
    const config = fixedConfig('cana', 'nada');
    const state = createGame(config, 13);
    const player = currentPlayer(state)!;
    player.items = ['porro' as ItemId];

    applyAction(state, config, { type: 'useItem', item: 'porro' });

    expect(player.status).toBe('partying');
    expect(player.drinksThisPhase).toBe(0);
    expect(player.intox).toBe(0);
    expect(currentPlayer(state)!.id).not.toBe(player.id);
  });

  it('farlopa halves only its own extra draw, not the turn’s normal drink', () => {
    // Cubata is 3 intoxication, so the halved extra draw is 1 and the normal
    // drink that follows is a full 3.
    const config = fixedConfig('cubata', 'nada');
    const state = createGame(config, 14);
    const player = currentPlayer(state)!;
    player.items = ['farlopa' as ItemId];

    applyAction(state, config, { type: 'useItem', item: 'farlopa' });
    expect(player.intox).toBe(1);
    expect(player.drinksThisPhase).toBe(1);
    expect(player.resaca).toBe(config.resaca.farlopa);

    // Still the same player's turn — the extra turn did not consume it.
    expect(currentPlayer(state)!.id).toBe(player.id);
    applyAction(state, config, { type: 'drink' });
    expect(player.intox).toBe(4);
  });

  it('kebab and water sober you up without ending the turn', () => {
    const config = fixedConfig('cana', 'nada');
    const state = createGame(config, 15);
    const player = currentPlayer(state)!;
    player.items = ['kebab' as ItemId];
    player.intox = 10;

    applyAction(state, config, { type: 'useItem', item: 'kebab' });

    expect(player.intox).toBe(10 - config.items.kebabRelief);
    expect(currentPlayer(state)!.id).toBe(player.id);
  });

  it('never lets intoxication go below zero', () => {
    const config = fixedConfig('cana', 'nada');
    const state = createGame(config, 16);
    const player = currentPlayer(state)!;
    player.items = ['kebab' as ItemId];
    player.intox = 1;

    applyAction(state, config, { type: 'useItem', item: 'kebab' });
    expect(player.intox).toBe(0);
  });
});

describe('the limit', () => {
  it('stays face-down until the configured phase', () => {
    for (const [revealAt, phase] of [
      ['tardeo', 0],
      ['noche', 1],
      ['after', 2],
    ] as const) {
      const config = fixedConfig('agua', 'nada', (c) => {
        c.limitRevealAt = revealAt;
      });
      const state = createGame(config, 17);
      expect(state.limitRevealed).toBe(phase === 0);

      withdrawAll(state, config, atPhase(state, 0, phase));
      expect(state.limitRevealed).toBe(true);
    }
  });

  it('is never revealed when configured to stay hidden', () => {
    const config = fixedConfig('agua', 'nada', (c) => {
      c.limitRevealAt = 'never';
    });
    const state = createGame(config, 18);
    withdrawAll(state, config, () => state.day === 1);
    expect(state.limitRevealed).toBe(false);
  });

  it('is re-drawn each morning', () => {
    const config = fixedConfig('agua', 'nada');
    const state = createGame(config, 19);
    expect(config.limitDecks.viernes).toContain(state.limit);

    withdrawAll(state, config, atPhase(state, 1, 0));
    expect(config.limitDecks.sabado).toContain(state.limit);
  });
});

describe('day VP multiplier', () => {
  it('scales the whole round at the rate for the day it was earned', () => {
    const config = noFrictionConfig('agua', 'nada');
    const state = createGame(config, 20);

    withdrawAll(state, config, atPhase(state, 0, 2));
    state.players[0]!.roundVP = 20;
    withdrawAll(state, config, () => state.day !== 0);

    expect(state.players[0]!.bankedVP).toBe(Math.round(20 * config.dayVPMultiplier[0]!));

    withdrawAll(state, config, atPhase(state, 1, 2));
    const before = state.players[0]!.bankedVP;
    state.players[0]!.roundVP = 20;
    withdrawAll(state, config, () => state.day !== 1);

    expect(state.players[0]!.bankedVP - before).toBe(Math.round(20 * config.dayVPMultiplier[1]!));
  });
});

/**
 * The three interactions the design is actually built around. If any of these
 * stops working the game still runs, which is exactly why they are pinned.
 */
describe('the designed dramas', () => {
  it('a player over the limit at the After reveal can scramble back under with a kebab', () => {
    const config = noFrictionConfig('cana', 'nada');
    const state = createGame(config, 30);

    withdrawAll(state, config, atPhase(state, 0, 2));
    expect(state.limitRevealed).toBe(true); // the reveal is what makes this a decision

    const player = state.players[0]!;
    player.items = ['kebab' as ItemId, 'botella' as ItemId];
    player.intox = state.limit + 4;

    while (currentPlayer(state)!.id !== player.id) applyAction(state, config, { type: 'withdraw' });
    applyAction(state, config, { type: 'useItem', item: 'kebab' });
    // A kebab alone is not enough at d=4, which is the point: the scramble can fail.
    expect(player.intox).toBe(state.limit + 4 - config.items.kebabRelief);

    applyAction(state, config, { type: 'useItem', item: 'botella' });
    expect(player.intox).toBeLessThanOrEqual(state.limit);

    withdrawAll(state, config, () => state.day !== 0);
    expect(state.jumps).toHaveLength(0);
    expect(player.status).not.toBe('dead');
  });

  it('a redada rescues a contraband holder who was otherwise going over the balcony', () => {
    const config = fixedConfig('cana', 'redada', (c) => {
      c.limitRevealAt = 'tardeo';
    });
    const state = createGame(config, 31);

    const doomed = currentPlayer(state)!;
    doomed.items = ['pastis' as ItemId];
    doomed.roundVP = 18;
    doomed.intox = state.limit + 5; // comfortably fatal

    applyAction(state, config, { type: 'drink' });

    expect(doomed.status).toBe('arrested');
    expect(state.stats.redadaRescues).toBe(1);
    expect(doomed.bankedVP).toBeGreaterThan(0);

    withdrawAll(state, config, () => state.day !== 0);
    expect(state.jumps.some((j) => j.playerId === doomed.id)).toBe(false);
    expect(doomed.status).not.toBe('dead');
  });

  it('a friday vomit leaves you starting sunday already part-way to the limit', () => {
    const config = fixedConfig('cana', 'vomitona');
    const state = createGame(config, 32);
    const player = currentPlayer(state)!;

    const vomitonaResaca = EVENTS.vomitona.resaca!;
    applyAction(state, config, { type: 'drink' });
    expect(player.resaca).toBe(vomitonaResaca);

    withdrawAll(state, config, atPhase(state, 2, 0));
    expect(state.day).toBe(2);
    expect(player.intox).toBeGreaterThanOrEqual(vomitonaResaca);
    expect(player.intox).toBe(player.resaca);
  });
});

describe('determinism', () => {
  it('produces byte-identical games from the same seed, including the roll', () => {
    const config = cloneConfig(defaultConfig);
    const play = () => {
      const state = createGame(config, 4242);
      let guard = 0;
      while (!state.over && ++guard < 5000) {
        const player = currentPlayer(state);
        if (!player) break;
        // A fixed, state-dependent policy so any RNG divergence shows up.
        applyAction(state, config, player.intox % 3 === 0 ? { type: 'drink' } : { type: 'withdraw' });
      }
      return JSON.stringify(state);
    };
    expect(play()).toBe(play());
  });

  it('produces different games from different seeds', () => {
    const config = cloneConfig(defaultConfig);
    const limits = new Set<number>();
    for (let seed = 0; seed < 40; seed++) limits.add(createGame(config, seed).limit);
    expect(limits.size).toBeGreaterThan(1);
  });
});

describe('state shape', () => {
  it('stays JSON-serialisable, as boardgame.io G requires', () => {
    const config = cloneConfig(defaultConfig);
    const state = createGame(config, 99);
    let guard = 0;
    while (!state.over && ++guard < 3000) {
      if (!currentPlayer(state)) break;
      applyAction(state, config, { type: 'drink' });
    }
    const round = JSON.parse(JSON.stringify(state)) as GameState;
    expect(round).toEqual(state);
  });
});

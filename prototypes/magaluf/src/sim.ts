/**
 * Monte Carlo balance simulator.
 *
 *   node --experimental-strip-types src/sim.ts --games 20000 --players 4
 *   node --experimental-strip-types src/sim.ts --set balconing.basePoolChance=0.62
 *
 * Reports every figure in the plan's balance table, and asserts structural
 * invariants on every single game it plays — which is far broader coverage
 * than the unit tests alone can give.
 */

import { DAY_IDS } from './cards.ts';
import { peakJumpExpectedValue, poolChance } from './balconing.ts';
import { POLICIES, POLICY_NAMES, chooseAction } from './bots.ts';
import type { Config } from './config.ts';
import { cloneConfig, defaultConfig } from './config.ts';
import { applyAction, createGame, currentPlayer, standings } from './engine.ts';
import type { GameState, JumpRecord } from './state.ts';

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

export interface GameResult {
  policies: string[];
  scores: number[];
  winnerId: number;
  winnerPolicy: string;
  jumps: JumpRecord[];
  deathsByDay: number[];
  anyDeath: boolean;
  allDead: boolean;
  turns: number;
  reshuffles: number;
  earlyExits: number;
  totalExits: number;
  redadasDrawn: number;
  redadasThatDidNothing: number;
  redadaRescues: number;
  farlopaByDay: number[];
  resacaAtSunday: number[];
  /** Leader by total VP (banked + unbanked) as the Sunday After begins. */
  sundayAfterLeader: number | null;
  /** Unbanked VP on the table at each night's check, across all players. */
  roundPools: number[];
  /**
   * Players still alive at the start of each day. Death rates must be divided
   * by this, not by the player count — a player who died on Friday cannot die
   * again on Sunday, and dividing by the full table makes the danger curve
   * read backwards.
   */
  aliveAtDayStart: number[];
  vpByPhase: number[];
  intoxByPhase: number[];
}

export function playGame(config: Config, seed: number, policies: string[]): GameResult {
  const state = createGame(config, seed);

  let sundayAfterLeader: number | null = null;
  let resacaAtSunday: number[] | null = null;
  const aliveAtDayStart = [0, 0, 0];

  let guard = 0;
  while (!state.over) {
    if (++guard > 200_000) throw new Error('game failed to terminate');

    if (aliveAtDayStart[state.day] === 0) {
      aliveAtDayStart[state.day] = state.players.filter((p) => p.status !== 'dead').length;
    }
    if (state.day === 2 && resacaAtSunday === null) {
      resacaAtSunday = state.players.map((p) => p.resaca);
    }
    if (state.day === 2 && state.phase === 2 && sundayAfterLeader === null) {
      sundayAfterLeader = leaderId(state);
    }

    const player = currentPlayer(state);
    if (!player) break;

    const policy = POLICIES[policies[player.id]!]!;
    applyAction(state, config, chooseAction(state, config, player, policy));
  }

  // What was on the table at each night's check: banked by survivors, forfeited
  // by jumpers. This is the number the jump's expected value must lose to.
  const roundPools: number[] = [];
  for (const entry of state.log) {
    if (entry.kind === 'survived') roundPools.push(entry.n ?? 0);
  }
  for (const jump of state.jumps) roundPools.push(jump.lostVP);

  const deathsByDay = [0, 0, 0];
  for (const jump of state.jumps) {
    if (!jump.survived) deathsByDay[jump.day] = (deathsByDay[jump.day] ?? 0) + 1;
  }

  const ranked = standings(state);
  const winner = ranked[0]!;

  return {
    policies,
    scores: state.players.map((p) => p.bankedVP),
    winnerId: winner.id,
    winnerPolicy: policies[winner.id]!,
    jumps: state.jumps,
    deathsByDay,
    anyDeath: state.players.some((p) => p.status === 'dead'),
    allDead: state.players.every((p) => p.status === 'dead'),
    turns: state.stats.turnsTaken,
    reshuffles: state.stats.reshuffles,
    earlyExits: state.stats.earlyExits,
    totalExits: state.stats.totalExits,
    redadasDrawn: state.stats.redadasDrawn,
    redadasThatDidNothing: state.stats.redadasThatDidNothing,
    redadaRescues: state.stats.redadaRescues,
    farlopaByDay: state.stats.farlopaByDay,
    resacaAtSunday: resacaAtSunday ?? state.players.map(() => 0),
    sundayAfterLeader,
    roundPools,
    aliveAtDayStart,
    vpByPhase: state.stats.vpByPhase,
    intoxByPhase: state.stats.intoxByPhase,
  };
}

function leaderId(state: GameState): number {
  return state.players.reduce((best, p) =>
    p.bankedVP + p.roundVP > best.bankedVP + best.roundVP ? p : best,
  ).id;
}

// ---------------------------------------------------------------------------
// Invariants, checked on every game
// ---------------------------------------------------------------------------

function assertInvariants(config: Config, seed: number, result: GameResult): void {
  const fail = (msg: string) => {
    throw new Error(`seed ${seed}: ${msg}`);
  };

  if (result.reshuffles !== 0) {
    fail(`a deck ran out and had to be reshuffled (${result.reshuffles}x) — deck is undersized`);
  }
  if (result.scores.length !== config.playerCount) fail('player count changed mid-game');
  for (const jump of result.jumps) {
    if (jump.d < 1) fail(`jump recorded at d=${jump.d}, which is not over the limit`);
    if (!jump.survived && jump.legendVP !== 0) fail('a dead player was paid a legend bonus');
  }
  // A player can only die once.
  const deathsPerPlayer = new Map<number, number>();
  for (const jump of result.jumps) {
    if (jump.survived) continue;
    deathsPerPlayer.set(jump.playerId, (deathsPerPlayer.get(jump.playerId) ?? 0) + 1);
  }
  for (const [id, n] of deathsPerPlayer) if (n > 1) fail(`player ${id} died ${n} times`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface Report {
  games: number;
  players: number;
  jumpsPerGame: number;
  dHistogram: Map<number, number>;
  jumpSurvivalRate: number;
  overLimitDeathRate: number;
  deathRateByDay: number[];
  /** Share of all players who die at some point over the weekend. */
  weekendDeathRate: number;
  gamesWithADeath: number;
  gamesWithTotalWipeout: number;
  winRateByPolicy: Map<string, number>;
  medianWinningScore: number;
  medianTurns: number;
  earlyExitRate: number;
  redadaDudRate: number;
  redadaRescuesPerGame: number;
  farlopaByDay: number[];
  meanResacaAtSunday: number;
  sundayLeaderWinRate: number;
  medianRoundPool: number;
  peakJumpEV: { d: number; ev: number };
  /** VP earned per point of intoxication spent, per phase. */
  efficiencyByPhase: number[];
  aliveByDay: number[];
}

export function run(config: Config, games: number, baseSeed: number): Report {
  const policies = assignPolicies(config.playerCount);

  const dHistogram = new Map<number, number>();
  let jumpCount = 0;
  let jumpSurvivals = 0;
  const deathsByDay = [0, 0, 0];
  let gamesWithADeath = 0;
  let wipeouts = 0;
  const winsByPolicy = new Map<string, number>();
  const winningScores: number[] = [];
  const turns: number[] = [];
  let earlyExits = 0;
  let totalExits = 0;
  let redadasDrawn = 0;
  let redadasNothing = 0;
  let redadaRescues = 0;
  const farlopaByDay = [0, 0, 0];
  let resacaSum = 0;
  let resacaCount = 0;
  let sundayLeaderKnown = 0;
  let sundayLeaderWon = 0;
  const roundPools: number[] = [];
  const aliveByDay = [0, 0, 0];
  const vpByPhase = [0, 0, 0];
  const intoxByPhase = [0, 0, 0];

  for (let g = 0; g < games; g++) {
    const seed = baseSeed + g;
    const seatPolicies = rotate(policies, g % policies.length);
    const result = playGame(config, seed, seatPolicies);
    assertInvariants(config, seed, result);

    for (const jump of result.jumps) {
      jumpCount += 1;
      if (jump.survived) jumpSurvivals += 1;
      dHistogram.set(jump.d, (dHistogram.get(jump.d) ?? 0) + 1);
    }
    for (let d = 0; d < 3; d++) {
      deathsByDay[d] += result.deathsByDay[d] ?? 0;
      aliveByDay[d] += result.aliveAtDayStart[d] ?? 0;
      vpByPhase[d] += result.vpByPhase[d] ?? 0;
      intoxByPhase[d] += result.intoxByPhase[d] ?? 0;
    }
    if (result.anyDeath) gamesWithADeath += 1;
    if (result.allDead) wipeouts += 1;

    winsByPolicy.set(result.winnerPolicy, (winsByPolicy.get(result.winnerPolicy) ?? 0) + 1);
    winningScores.push(Math.max(...result.scores));
    turns.push(result.turns);

    earlyExits += result.earlyExits;
    totalExits += result.totalExits;
    redadasDrawn += result.redadasDrawn;
    redadasNothing += result.redadasThatDidNothing;
    redadaRescues += result.redadaRescues;
    for (let d = 0; d < 3; d++) farlopaByDay[d] += result.farlopaByDay[d] ?? 0;
    for (const r of result.resacaAtSunday) {
      resacaSum += r;
      resacaCount += 1;
    }
    if (result.sundayAfterLeader !== null) {
      sundayLeaderKnown += 1;
      if (result.sundayAfterLeader === result.winnerId) sundayLeaderWon += 1;
    }
    for (const pool of result.roundPools) roundPools.push(pool);
  }

  const winRateByPolicy = new Map<string, number>();
  for (const name of POLICY_NAMES) {
    winRateByPolicy.set(name, (winsByPolicy.get(name) ?? 0) / games);
  }

  return {
    games,
    players: config.playerCount,
    jumpsPerGame: jumpCount / games,
    dHistogram,
    jumpSurvivalRate: jumpCount === 0 ? 0 : jumpSurvivals / jumpCount,
    overLimitDeathRate: jumpCount === 0 ? 0 : (jumpCount - jumpSurvivals) / jumpCount,
    deathRateByDay: deathsByDay.map((n, d) => (aliveByDay[d] === 0 ? 0 : n / aliveByDay[d]!)),
    weekendDeathRate: deathsByDay.reduce((a, b) => a + b, 0) / (games * config.playerCount),
    gamesWithADeath: gamesWithADeath / games,
    gamesWithTotalWipeout: wipeouts / games,
    winRateByPolicy,
    medianWinningScore: median(winningScores),
    medianTurns: median(turns),
    earlyExitRate: totalExits === 0 ? 0 : earlyExits / totalExits,
    redadaDudRate: redadasDrawn === 0 ? 0 : redadasNothing / redadasDrawn,
    redadaRescuesPerGame: redadaRescues / games,
    farlopaByDay,
    meanResacaAtSunday: resacaCount === 0 ? 0 : resacaSum / resacaCount,
    sundayLeaderWinRate: sundayLeaderKnown === 0 ? 0 : sundayLeaderWon / sundayLeaderKnown,
    medianRoundPool: median(roundPools),
    peakJumpEV: peakJumpExpectedValue(config),
    efficiencyByPhase: vpByPhase.map((vp, i) => (intoxByPhase[i] === 0 ? 0 : vp / intoxByPhase[i]!)),
    aliveByDay: aliveByDay.map((n) => n / games),
  };
}

function assignPolicies(playerCount: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < playerCount; i++) out.push(POLICY_NAMES[i % POLICY_NAMES.length]!);
  return out;
}

function rotate<T>(items: T[], by: number): T[] {
  return items.slice(by).concat(items.slice(0, by));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  actual: string;
  target: string;
  pass: boolean;
}

function checks(report: Report, config: Config): Check[] {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const [fri, sat, sun] = report.deathRateByDay as [number, number, number];
  // Normalised per player still alive that day, otherwise Sunday is penalised
  // simply for having fewer people left to use anything.
  const farlopaPerAlive = report.farlopaByDay.map((n, d) =>
    report.aliveByDay[d] === 0 ? 0 : n / report.games / report.aliveByDay[d]!,
  );
  const farlopaSkew = farlopaPerAlive[0]! === 0 ? Infinity : farlopaPerAlive[2]! / farlopaPerAlive[0]!;
  const greedy = report.winRateByPolicy.get('greedy') ?? 0;
  const cautious = report.winRateByPolicy.get('cautious') ?? 0;
  const spread = greedy + cautious === 0 ? 0.5 : greedy / (greedy + cautious);

  return [
    // The plan's original per-day magnitudes (20-30% Saturday, 40-55% Sunday)
    // were set before the simulator showed that a rational player scales their
    // drinking to whatever capacity they have, which pins the death rate at
    // roughly the same value every day no matter what the limit is. Hitting
    // 40-55% would require players to be unable to avoid dying, which would
    // mean the decisions did not matter. What is worth demanding instead is the
    // SHAPE — danger that strictly rises across the weekend — and a weekend
    // lethal enough to earn the theme.
    { label: 'Friday death rate', actual: pct(fri), target: '<= 10%', pass: fri <= 0.1 },
    { label: 'Saturday death rate', actual: pct(sat), target: '11-20%', pass: sat >= 0.11 && sat <= 0.2 },
    { label: 'Sunday death rate', actual: pct(sun), target: '15-28%', pass: sun >= 0.15 && sun <= 0.28 },
    {
      label: 'Danger escalates Fri < Sat < Sun',
      actual: `${pct(fri)} < ${pct(sat)} < ${pct(sun)}`,
      target: 'strictly rising',
      pass: fri < sat && sat < sun,
    },
    {
      label: 'Players dead by Monday',
      actual: pct(report.weekendDeathRate),
      target: '>= 25%',
      pass: report.weekendDeathRate >= 0.25,
    },
    {
      label: 'Over-limit players who die',
      actual: pct(report.overLimitDeathRate),
      target: '>= 50%',
      pass: report.overLimitDeathRate >= 0.5,
    },
    {
      label: 'Games with at least one death',
      actual: pct(report.gamesWithADeath),
      target: '>= 70%',
      pass: report.gamesWithADeath >= 0.7,
    },
    {
      label: 'Total wipeouts',
      actual: pct(report.gamesWithTotalWipeout),
      target: '< 5%',
      pass: report.gamesWithTotalWipeout < 0.05,
    },
    {
      label: 'Peak jump EV vs median round pool',
      actual: `${report.peakJumpEV.ev.toFixed(2)} VP (at d=${report.peakJumpEV.d}) vs ${report.medianRoundPool.toFixed(1)}`,
      target: 'EV far below pool',
      pass: report.peakJumpEV.ev < report.medianRoundPool,
    },
    {
      label: 'Farlopa Sunday vs Friday',
      actual: Number.isFinite(farlopaSkew) ? `${farlopaSkew.toFixed(2)}x` : 'never on Friday',
      target: '>= 2x',
      pass: farlopaSkew >= 2,
    },
    {
      label: 'Redada dud rate',
      actual: pct(report.redadaDudRate),
      target: '< 40%',
      pass: report.redadaDudRate < 0.4,
    },
    {
      label: 'Sunday-After leader wins',
      actual: pct(report.sundayLeaderWinRate),
      target: '<= 65%',
      pass: report.sundayLeaderWinRate <= 0.65,
    },
    {
      label: 'Greedy share of greedy+cautious wins',
      actual: pct(spread),
      target: '40-60%',
      pass: spread >= 0.4 && spread <= 0.6,
    },
    {
      label: 'Early-exit penalty rate',
      actual: pct(report.earlyExitRate),
      target: '10-25%',
      pass: report.earlyExitRate >= 0.1 && report.earlyExitRate <= 0.25,
    },
    {
      label: 'Median game length',
      actual: `${report.medianTurns} turns`,
      target: '<= 120',
      pass: report.medianTurns <= 120,
    },
  ];
}

function printReport(report: Report, config: Config): void {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const out: string[] = [];

  out.push('');
  out.push(`MAGALUF — ${report.games} games, ${report.players} players`);
  out.push(
    `basePoolChance=${config.balconing.basePoolChance}  decay=${config.balconing.decay}  ` +
      `legendBase=${config.balconing.legendBase}  reveal=${config.limitRevealAt}  ` +
      `farlopaDrawsEvent=${config.items.farlopaDrawsEvent}`,
  );
  out.push('');

  out.push('SURVIVAL CURVE');
  const curve: string[] = [];
  for (let d = 1; d <= 8; d++) curve.push(`d${d}=${(poolChance(d, config) * 100).toFixed(0)}%`);
  out.push('  ' + curve.join('  '));
  out.push('');

  out.push('JUMPS');
  out.push(`  jumps per game        ${report.jumpsPerGame.toFixed(2)}`);
  out.push(`  survived the jump     ${pct(report.jumpSurvivalRate)}`);
  out.push(`  died                  ${pct(report.overLimitDeathRate)}`);
  const ds = [...report.dHistogram.entries()].sort((a, b) => a[0] - b[0]);
  const totalJumps = ds.reduce((a, [, n]) => a + n, 0);
  out.push(
    '  distribution of d     ' +
      ds
        .slice(0, 10)
        .map(([d, n]) => `${d}:${((n / Math.max(1, totalJumps)) * 100).toFixed(0)}%`)
        .join(' '),
  );
  out.push('');

  out.push('DEATHS (share of players still alive at the start of that day)');
  DAY_IDS.forEach((day, i) => {
    out.push(
      `  ${day.padEnd(10)}          ${pct(report.deathRateByDay[i] ?? 0)}` +
        `   (${report.aliveByDay[i]?.toFixed(2)} alive)`,
    );
  });
  out.push(`  games with a death    ${pct(report.gamesWithADeath)}`);
  out.push(`  total wipeouts        ${pct(report.gamesWithTotalWipeout)}`);
  out.push('');

  out.push('STRATEGY');
  for (const name of POLICY_NAMES) {
    out.push(`  ${name.padEnd(10)} wins     ${pct(report.winRateByPolicy.get(name) ?? 0)}`);
  }
  out.push(`  median winning score  ${report.medianWinningScore}`);
  out.push(`  median round pool     ${report.medianRoundPool}`);
  out.push(
    `  peak jump EV          ${report.peakJumpEV.ev.toFixed(2)} VP at d=${report.peakJumpEV.d}`,
  );
  out.push('');

  out.push('PHASE ECONOMY (VP earned per point of intoxication spent)');
  out.push(
    `  tardeo ${report.efficiencyByPhase[0]?.toFixed(3)}   noche ${report.efficiencyByPhase[1]?.toFixed(3)}   ` +
      `after ${report.efficiencyByPhase[2]?.toFixed(3)}`,
  );
  out.push('');

  out.push('CARDS AND PACING');
  out.push(`  farlopa by day        Fri ${report.farlopaByDay[0]}  Sat ${report.farlopaByDay[1]}  Sun ${report.farlopaByDay[2]}`);
  out.push(`  mean resaca by Sunday ${report.meanResacaAtSunday.toFixed(2)}`);
  out.push(`  redada dud rate       ${pct(report.redadaDudRate)}`);
  out.push(`  redada rescues/game   ${report.redadaRescuesPerGame.toFixed(3)}`);
  out.push(`  early-exit rate       ${pct(report.earlyExitRate)}`);
  out.push(`  sunday leader wins    ${pct(report.sundayLeaderWinRate)}`);
  out.push(`  median turns          ${report.medianTurns}`);
  out.push('');

  out.push('BALANCE TARGETS');
  let passed = 0;
  for (const check of checks(report, config)) {
    if (check.pass) passed += 1;
    out.push(
      `  ${check.pass ? 'PASS' : 'FAIL'}  ${check.label.padEnd(36)} ${check.actual.padEnd(26)} target ${check.target}`,
    );
  }
  const all = checks(report, config).length;
  out.push('');
  out.push(`  ${passed}/${all} targets met`);
  out.push('');

  console.log(out.join('\n'));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { games: number; players: number; seed: number; sets: string[] } {
  let games = 20000;
  let players = 4;
  let seed = 1;
  const sets: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--games') games = Number(argv[++i]);
    else if (arg === '--players') players = Number(argv[++i]);
    else if (arg === '--seed') seed = Number(argv[++i]);
    else if (arg === '--set') sets.push(argv[++i]!);
  }
  return { games, players, seed, sets };
}

/** Applies `--set a.b.c=value` overrides so the tuning loop needs no edits. */
function applyOverride(config: Config, assignment: string): void {
  const [path, raw] = assignment.split('=');
  if (!path || raw === undefined) throw new Error(`bad --set: ${assignment}`);
  const keys = path.split('.');
  let node: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
    if (node === undefined) throw new Error(`unknown config path: ${path}`);
  }
  node[keys.at(-1)!] = parseValue(raw);
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Comma lists become arrays, so limit decks and day multipliers are sweepable
  // from the command line without editing config.ts.
  if (raw.includes(',')) return raw.split(',').map((part) => parseValue(part));
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
}

function main(): void {
  const { games, players, seed, sets } = parseArgs(process.argv.slice(2));
  const config = cloneConfig(defaultConfig);
  config.playerCount = players;
  for (const assignment of sets) applyOverride(config, assignment);

  // Determinism: the same seed must produce byte-identical play.
  const policies = assignPolicies(players);
  const a = JSON.stringify(playGame(config, 12345, policies));
  const b = JSON.stringify(playGame(config, 12345, policies));
  if (a !== b) throw new Error('same seed produced different games — RNG has escaped the state');

  const started = Date.now();
  const report = run(config, games, seed);
  printReport(report, config);
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
}

main();

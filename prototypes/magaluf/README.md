# Magaluf — design prototype

A playable prototype and balance simulator for **Magaluf**, an original
push-your-luck game. Built to settle the design *before* a spec is written,
because unlike every other game in this repo there is no rulebook to
paraphrase — the rules did not exist.

- **[design.md](design.md)** — the design, with the evidence behind every
  number. This is the intended source for
  `spec/features/032-magaluf-rules/spec.md`.

This directory sits **outside the npm workspaces** (`packages/*`), so it
cannot affect the app's build, lint or tests. It has **no dependencies** —
Node 22 strips TypeScript types natively.

## Run it

Play a hot-seat game in the browser:

```bash
npx vite prototypes/magaluf --port 5174
```

It is also registered in `.claude/launch.json` as `magaluf-proto`.

The tuning panel on the right edits the live config and restarts: player
count, limit shift, reveal timing, the balconing survival curve, and the
Resaca values. Any player over a *revealed* limit shows a live
`BALCÓN nn%` badge — their odds if the night ended now.

## Simulate it

```bash
node --experimental-strip-types prototypes/magaluf/src/sim.ts --games 20000 --players 4
```

Reports death curves, the distribution of how far over the limit players go,
win rate per bot policy, phase economy, and every balance target. It also
asserts structural invariants on every game it plays, which is far broader
coverage than the tests alone.

Any config value can be overridden without editing a file, including arrays:

```bash
node --experimental-strip-types prototypes/magaluf/src/sim.ts --set balconing.basePoolChance=0.62 --set limitDecks.domingo=12,16,20,24
```

## Test it

```bash
npx vitest run --root prototypes/magaluf
```

25 tests covering the rules that are easy to break silently: Resaca as the
morning floor, the jump costing the round pool only when the roll fails, arrest
cancelling the limit check, the Aguafiestas boundary, Farlopa halving only
its own extra draw, reveal timing, determinism under a fixed seed, and the
three interactions the design actually rests on.

## Layout

```
src/config.ts      every tunable number and flag, in one file
src/cards.ts       alcohol / event / item data, with es + en names
src/rng.ts         seeded generator behind a narrow Random interface
src/state.ts       state shape and low-level primitives
src/events.ts      event resolution
src/balconing.ts   the jump: survival curve, legend bonus, resaca
src/engine.ts      turn / phase / day orchestration and the public API
src/bots.ts        policies for the simulator only — no AI ships in the game
src/sim.ts         Monte Carlo runner and report
web/main.ts        hot-seat UI (plain DOM, no framework)
```

No rule lives in the UI, and no string lives in the engine.

# Feature 032 — Magaluf Rules: Tasks

- [x] 1. `prototypes/magaluf/` — design and balance the game before specifying
      it. Reference engine, Monte Carlo simulator, hot-seat prototype and
      `design.md`. Merged to `main` so the spec can cite it.
      **Verify:** 15/15 balance targets at 4 players over 20,000 games; 25
      prototype tests pass.

- [x] 2. `spec/features/032-magaluf-rules/spec.md` — the rules spec, built
      from `design.md`.
      **Verify:** 24 acceptance criteria, each mapped to a test below.

- [x] 3. `packages/game-core/src/games/magaluf/cards.ts` — alcohol, item and
      event catalogues. Ids and numbers only; names live in `magaluf.*` keys
      derived from those ids.
      **Verify:** AC23's card-key coverage test enumerates this file.

- [x] 4. `packages/game-core/src/games/magaluf/constants.ts` — tuned rules
      constants: limit decks, day multipliers, balconing curve, per-phase
      caps and deck compositions.

- [x] 5. `packages/game-core/src/games/magaluf/settings.ts` — `settingsSchema`
      of raw numeric dials plus `clampSettings`.
      **Verify:** AC18 — three tests covering out-of-range clamping,
      non-finite fallback, and arrival through `setupData`.

- [x] 6. `packages/game-core/src/games/magaluf/rng.ts` — the `Rng` interface
      and its boardgame.io `random` adapter.

      **Deviation from the original plan:** none in shape, and this is the
      part of the port that most repaid the prototype's discipline. Because
      the prototype already ran on a seeded generator behind this exact
      interface, swapping in boardgame.io's plugin was a single new file with
      no changes to any rule.

- [x] 7. `packages/game-core/src/games/magaluf/state.ts`,
      `balconing.ts`, `events.ts` — state shape, primitives, the jump, and
      event resolution. Ported from the prototype, re-keyed from array indices
      to seat IDs.

- [x] 8. `packages/game-core/src/games/magaluf/gameDef.ts` — the boardgame.io
      `Game`: setup, three moves, custom `TurnOrderConfig`, `endIf`,
      `playerView`.

      **Deviation from plan.md's first draft:** the turn order was going to
      re-derive the next seat inside `TurnOrderConfig.next`. It does not.
      Phase and day transitions happen *inside* the move that triggers them,
      so by the time `next` runs the phase may already have changed — making
      any re-derivation there a duplicate of logic that had just run, against
      state that had already moved on. The move now writes `G.turnSeatID` and
      `next` simply reads it.

      **Second deviation:** `minMoves`/`maxMoves: 1` (Cahoots' pattern) is
      unusable here, because using an item is a free action that must not end
      the turn. Moves call `events.endTurn()` explicitly instead.

- [x] 9. `packages/game-core/src/games/magaluf/index.ts` +
      `gamesCatalog.ts` — the `GameModule` and its one-line registration.
      `minPlayers: 3`, `maxPlayers: 6`.
      **Verify:** server integration suite still boots (75 tests pass).

- [x] 10. `packages/client/src/i18n/locales/{en,es}.json` — the `magaluf`
      namespace: 20 alcohol names, 34 event strings, 6 items, 3 phases, 3
      days, 19 log lines, in both languages.
      **Verify:** `localeParity.test.ts` passes.

      **Deviation from plan.md:** log lines were going to resolve card names
      with i18next `$t()` nesting. They use the `descriptionKey` param
      instead — `ChatPanel` already renders a second nested translation from
      it (the affordance Cahoots uses for goal descriptions), which is proven
      in the real UI and needed no platform change.

- [x] 11. `packages/game-core/src/games/magaluf/gameDef.test.ts` — 37 tests
      covering AC1–AC22.
      **Verify:** all pass.

      **Deviation from plan.md:** several tests were written to plant state
      mid-match (an exact round pool, an over-limit intoxication). boardgame.io
      freezes `G`, so that is impossible. They now either set the condition at
      `setup` (a limit of 0 makes any drink fatal; a resaca equal to the limit
      puts a player exactly on it) or exercise the pure function directly.
      `Client` also takes no `setupData`, so AC18's setup test calls
      `magalufGameDef.setup` with a stub `random` rather than going through a
      client.

- [x] 12. `packages/game-core/src/games/magaluf/magalufModule.conformance.test.ts`
      — the shared suite.
      **Verify:** AC24, 5 tests pass.

      **Deviation from spec.md's first draft:** `secretKeys: ['limit']` was
      specified and is wrong. The suite models secrets as
      `Record<PlayerID, unknown>`; a global hidden number fails its
      `isPlainRecord` assertion. Passed empty, with AC17 covering the limit
      instead, and the spec corrected.

- [x] 13. `packages/game-core/src/games/magaluf/i18nKeys.test.ts` — asserts
      every key the engine can name exists in both locales.
      **Verify:** AC23, 2 tests pass. Added because nothing else covered it:
      `localeParity` only proves EN and ES agree with *each other*, so both
      could be missing the same key and still pass.

## Amended by feature 033

- [x] 14. `G.lastDraw` added to `MagalufG` — `{ seatID, alcohol, event }`, set
      in `takeDrink` and cleared in `startPhase`.

      **Why it did not exist here:** nothing in the rules needs it. It is
      purely so the board can reveal what a player drew, and that consumer did
      not exist until 033. Recovering it from the log tail was considered and
      rejected: a Ronda appends one `drank` entry per player and a Chupito de
      la casa chains a second for the same seat, so "the last entry" is not
      reliably "the draw that just happened".

      **Why this is not a `magaluf-v2`:** `tech-stack.md` forbids mutating a
      published version *once real matches are recorded against it*, because
      boardgame.io replays the move log against the `Game` definition.
      `magaluf-v1` shipped without a board and was never playable, so no match
      exists to corrupt. This was the last moment the change was free.

      **Verify:** three new tests — a drink populates it, a Ronda's knock-on
      drinks do not steal the reveal from the draw that caused them, and a new
      phase clears it. Suite now 47 tests.

## Verification record

- `npx vitest run --root packages/game-core src/games/magaluf` — **44 passed**
  (37 gameDef, 5 conformance, 2 i18n coverage).
- `npm run test:unit` — **241 passed** across 23 files, unchanged from the
  pre-magaluf baseline.
- `npm run test:integration` — **75 passed** across 13 files; the server boots
  with `magaluf-v1` in the catalog.
- `npx vitest run --root prototypes/magaluf` — **25 passed**, still green after
  the merge to `main`.

## Not done here

Feature 033 (board UI) — no `BoardComponent`, so `magaluf-v1` appears in the
catalog and the room's game picker but cannot yet be played through the
client. `boards.ts` and `boardRegistry.ts` are untouched.

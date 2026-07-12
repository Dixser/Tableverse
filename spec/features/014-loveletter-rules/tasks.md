# Feature 014 — Love Letter: Rules Engine: Tasks

Scaffold first (feature 011's generator, this feature's first real
consumer), then deck construction, then the core `setup`/phase/turn-order
skeleton, then card effects, then `playerView`, then the round-to-match
handoff, then the full test suite.

- [ ] 1. Run `npm run new-game -- loveletter-v1 "Love Letter"` (feature
      011) to create `packages/game-core/src/games/loveletter/`'s base
      skeleton. Do **not** yet register it in `gamesCatalog.ts` (task 9).
      **Verify:** the generated skeleton typechecks and its placeholder
      test passes, unmodified, before any hand-editing begins.
- [ ] 2. `packages/game-core/src/games/loveletter/deck.ts` +
      `deck.test.ts` — `NORMAL_COMPOSITION`, `CLASSIC_REMOVALS`,
      `buildDeck(edition)`, per plan.md.
      **Verify:** spec.md AC1's deck-shape half — 21 vs. 16 cards, exact
      per-rank counts for both editions.
- [ ] 3. `gameDef.ts` — `LoveLetterG`/`LoveLetterView`/
      `LoveLetterSetupData` types; `setup`/`dealNewRound` (shuffle via
      `random.Shuffle`, facedown + 2-player faceup set-aside, initial
      deal); the `round` phase skeleton (`endIf: isRoundOver`, `next:
      'round'`, `turn.order: skipEliminatedTurnOrder`, `turn.onBegin:
      drawIntoActiveHand`); the classic-edition player-count guard in
      `setup` (spec.md AC6), per plan.md.
      **Verify:** a match can be constructed via a headless `Client` and
      reaches a dealt initial state at both 2 and 6 players (normal) and
      is rejected at 5+ players (classic).
- [ ] 4. `gameDef.ts` `moves.playCard` + one resolver function per card
      (Guard, Priest, Baron, Handmaid, Prince, Chancellor, King,
      Countess, Princess, Spy), per spec.md's card table and plan.md's
      Baron example. Countess forced-play validation
      (`INVALID_MOVE` if violated). `G.log` push for every public event
      (card played + target, elimination, round/match winner) per
      feature 012's `GameLogEntry` contract; `privateReveals` push for
      Baron/Priest only.
      **Verify:** spec.md AC2 — each card's effect exercised individually
      in `gameDef.test.ts`, including every edge case spec.md's card
      table calls out (Guard illegal self-name rejection, Handmaid
      all-protected fallback, Prince empty-deck draw and Princess-discard
      elimination, Chancellor near-empty-deck edge cases).
- [ ] 5. `gameDef.ts` `playerView` — `hands`/`privateReveals` narrowed to
      the viewer's own entry (or empty for a spectator), `_deck`/
      `_setAsideFacedown` stripped unconditionally for every viewer,
      `deckCount` derived, per plan.md.
      **Verify:** `playerView.test.ts` — spec.md AC9, `_deck`/
      `_setAsideFacedown` absent from every `playerID`'s view (including
      `null`) at multiple points in a played-out game, not just at
      `setup`.
- [ ] 6. `gameDef.ts` — `concludeRound` (round winner determination
      including the Spy bonus token, `roundWins` increment, `G.log`
      round-winner entry, match-threshold check via the per-`numPlayers`
      table, `nextRoundStartPlayerID` tie-break via `random`) wired as the
      `round` phase's `onEnd`; top-level `endIf`/`matchGameoverResult`
      reading `G.matchWinners`, per plan.md.
      **Verify:** spec.md AC3 (both round-end paths), AC5 (token
      persistence across rounds, threshold-triggered match end including
      simultaneous multi-winner).
- [ ] 7. `gameDef.test.ts` — fill in any remaining spec.md AC1-7 cases not
      already covered by tasks 2-6 (e.g. AC4's turn-order-skip resuming
      normal order once eliminations clear, AC7's full G.log
      presence/absence sweep across every event type).
- [ ] 8. `index.ts` (`loveletterModule: GameModule<LoveLetterG>`) +
      `loveletterModule.conformance.test.ts` —
      `testGameModuleConformance(loveletterModule, { secretKeys: ['hands',
      'privateReveals'] })`.
      **Verify:** spec.md AC8 — passes at both `minPlayers` (2) and
      `maxPlayers` (6), including determinism under a fixed seed.
- [ ] 9. `packages/game-core/src/gamesCatalog.ts` — register
      `loveletterModule` (the first of feature 011's three registration
      points; the other two belong to feature 015).
      **Verify:** `getGameModule('loveletter-v1')` resolves; server boots
      with the new entry in its games list.
- [ ] 10. Run `npm run test:unit --workspace=packages/game-core` and
      `npm run typecheck --workspace=packages/game-core`; confirm every
      spec.md acceptance criterion (AC1-9) has a corresponding passing
      test before this feature is considered ready to merge.

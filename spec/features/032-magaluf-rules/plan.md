# Feature 032 — Magaluf Rules: Implementation Plan

## Layering

| File | Owns | Depends on |
|---|---|---|
| `cards.ts` | Alcohol, item and event catalogues. Ids and numbers, no strings. | — |
| `constants.ts` | Tuned values: limit decks, day multipliers, balconing curve, per-phase caps and deck compositions. | `cards.ts` |
| `settings.ts` | `settingsSchema` and `clampSettings`. | `constants.ts` |
| `rng.ts` | The `Rng` interface and its boardgame.io adapter. | — |
| `state.ts` | `MagalufG`, `MagalufPlayer`, and every low-level mutation. | `cards`, `constants`, `settings`, `rng` |
| `balconing.ts` | The survival curve, legend bonus and roll. | `constants`, `settings`, `rng` |
| `events.ts` | Event resolution. | `state`, `cards`, `settings`, `rng` |
| `gameDef.ts` | Turn/phase/day orchestration and the boardgame.io `Game`. | everything above |
| `index.ts` | The `GameModule`. | `gameDef`, `settings` |

`state.ts` exists so `events.ts` can mutate `G` without importing `gameDef.ts`,
which would be a cycle. Same reason Cahoots splits `deck.ts` and `goals.ts` out
of its own `gameDef.ts`.

## The invariant that shapes everything

**A move owns its own consequences.** Drinking can trigger an event, which can
force more drinking, which can hit the phase cap, which can end the phase,
which can end the day, which can end the weekend — all inside one dispatch.
Nothing is deferred to a framework hook.

That is why there is no boardgame.io `phases` block, and why
`TurnOrderConfig.next` does not compute anything: by the time it runs, the
phase it would have reasoned about may no longer be the current one. The move
writes `G.turnSeatID`; `next` reads it. Any other split puts two authorities in
charge of the same question.

## Turn control

`minMoves`/`maxMoves: 1` — Cahoots' pattern — cannot be used, because
`useItem` is a free action that must not end the turn. Moves call
`events.endTurn()` themselves, and `applyItem` returns whether it consumed the
turn (true for Porro always, for Farlopa only when its extra draw hits the
cap).

## Hidden information

Exactly one field: `G.limit`. `playerView` replaces it with `HIDDEN_LIMIT`
unless `G.limitRevealed`, or the viewer is a seat whose `peekedLimit` is set by
spending a Red Bull. Spectators never see it early.

Everything else is public on purpose — intoxication drives table talk and
several events target the most drunk player, so hiding it would remove more
than it added.

## Settings

Raw numeric dials, chosen for playtest range over form tidiness. `SettingsForm`
renders unbounded `<input type="number">` and `validateGameSettings` checks
type but not range, so **`clampSettings` is the only thing standing between a
typo and a nonsense match**. It clamps in range and falls back to the tuned
default for anything non-finite — turning a mistyped probability into "maximum
lethality" would be worse than ignoring it.

## Testing / verification strategy

- `gameDef.test.ts` — headless `Client`, one or more tests per acceptance
  criterion. `client.store.getState()` throughout, never `client.getState()`,
  which would apply `playerView` and strip the field under test.
- Conditions are set at `setup` rather than planted mid-match: boardgame.io
  freezes `G`. A limit of 0 makes any drink fatal; a resaca equal to the limit
  puts a seat exactly on it.
- `magalufModule.conformance.test.ts` — the shared suite, `secretKeys: []`.
- `i18nKeys.test.ts` — reads both locale JSONs from disk and asserts every key
  the engine can name has a string. Spans two packages, so it can live wholly
  inside neither.

## Open risks

1. **No board until 033.** `magaluf-v1` is in the catalog, so it is selectable
   in a room, but `GameMount` will render `gameMount.unknownGame` for it.
   Degrades safely, but it is visible. Accepted because the catalog entry is
   what the server integration suite exercises.
2. **The Camello's random contraband** is a balance simplification carried over
   from the prototype. It slightly under-rewards item planning.
3. **The conformance suite cannot express globally hidden state.** Covered here
   by AC17, but any future game with a shared secret will hit the same gap.
4. **Settings are per-match, and matches are replayed from the move log.** A
   clamped value is stored in `G` at setup, so a resumed match keeps the
   settings it started with. Changing `clampSettings`' ranges later would not
   corrupt existing matches, but changing a *default* would alter any match
   whose host never touched the form — the usual reason `magaluf-v1` must
   never be mutated once real matches exist.

## Implementation-level non-goals

- No `BoardComponent`, no `boards.ts` or `boardRegistry.ts` change.
- No AI opponents; the prototype's bots are not ported.
- No range validation added to the shared `validateGameSettings`, though it
  would benefit every game and remove this module's clamping requirement.

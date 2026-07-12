# Feature 011 — Game Module Scaffolding

## Versioning classification (per tech-stack.md's heuristic)

Not applicable — this is not a game. It is developer tooling for the
platform itself: no `GameModule`, no catalog entry, no `id`.

## Description

A generator (template + a small Node script) that produces the boilerplate
for a new `GameModule`, so adding a game starts from a compiling, testable
skeleton instead of a blank directory and copy-pasting Tic-Tac-Toe by hand.

This is scoped deliberately narrowly. It scaffolds the **mechanical**
shape every `GameModule` must have — the parts fixed by the contract in
tech-stack.md since feature 001 and unchanged by which game is being added
— and nothing about how a game plays:

- The five files every game module needs (`gameDef.ts`, `index.ts`,
  `BoardComponent.tsx` + its CSS module, `gameDef.test.ts`, and a
  `*.conformance.test.ts`), pre-wired to compile and pass as a trivial
  no-op game.
- A checklist of the three registration points a new module must be wired
  into by hand (`gamesCatalog.ts`, `boards.ts`, `boardRegistry.ts` — see
  "Why three, not one" below) and the one design decision every new game
  version must make before writing any rules (the edition-vs-new-catalog-
  entry heuristic).

It explicitly does **not** scaffold anything about a game's actual rules,
UI, or hidden-information handling — there is no generic "card game
template" or "turn-based template" to extract, because the platform has
exactly one shipped game (Tic-Tac-Toe) with no hidden information, no
phases, and no settings. Roadmap.md's own principle for feature 011's
neighbor (Love Letter, the next real game) is explicit that a genre-shared
board UI kit must be *extracted from two real implementations*, not
designed speculatively ahead of them — this feature does not violate that
principle because it scaffolds the **contract-required plumbing**
(exists identically for every game, already proven by Tic-Tac-Toe alone),
not any shared game-logic or UI abstraction. If it ever grows into
generating opinionated rules/UI patterns, that is out of scope here and
must wait for a second and third real game to generalize from, same as the
board-UI-kit question.

## Why three, not one, registration points

Roadmap.md's feature 002 entry describes adding a game as "one line" in
`gamesCatalog.ts`. That was accurate when it was written, but a real
incident during feature 003 (documented in `game-core/src/types.ts` and
`spec/features/003-ui-styling/tasks.md`) split board-component
registration out of `GameModule`/`gamesCatalog.ts` entirely, because
`packages/server` imports `gamesCatalog.ts` at real Node runtime and
crashes if anything on that import path pulls in a `.module.css` file
Node can't resolve. The result, as the codebase stands today, is **three**
places a new game must be wired into by hand:

1. `packages/game-core/src/gamesCatalog.ts` — import the module, add it to
   the `gamesCatalog` array (server- and client-safe: rules/metadata only).
2. `packages/game-core/src/boards.ts` — re-export the `BoardComponent`
   (client-only entry point; never imported by `gamesCatalog.ts` or
   anything on the server's import path).
3. `packages/client/src/boardRegistry.ts` — map the catalog `id` to the
   `BoardComponent` re-exported from `boards.ts`.

Missing any one of these compiles fine but fails silently or confusingly
at runtime (a game selectable in the room UI with no board, or a server
that won't boot). This split is exactly the kind of thing a newcomer to
the codebase — or a returning contributor who last touched game-adding
before feature 003 — is likely to get wrong. The scaffolding's checklist
output exists specifically to make this three-file requirement
impossible to miss, not to eliminate it (see plan.md for why the
generator does not attempt to edit these three files automatically).

## User stories

### 1. Starting a new game module from a working skeleton

As a developer adding a new game, I run the generator with a game id and
display name and get a new `packages/game-core/src/games/<id>/` directory
containing a trivial-but-real `GameModule` — it typechecks, its
placeholder tests pass, and it is not yet wired into the catalog (so it
has zero effect on the running app until I choose to register it) — so I
can start replacing placeholder logic with real rules immediately instead
of first assembling boilerplate by hand.

### 2. Being told exactly what manual wiring remains

As that same developer, immediately after generation I get a printed
checklist naming the three registration points (`gamesCatalog.ts`,
`boards.ts`, `boardRegistry.ts`) with the exact line each needs, plus a
reminder to make the edition-vs-new-catalog-entry decision from
tech-stack.md's versioning heuristic before I pick my `id`, so I don't
discover a missed registration only after clicking around the app and
finding no board renders.

### 3. Scaffolding never touches existing files

As a developer running the generator in a repo with uncommitted work in
progress elsewhere (rooms, presence, an unrelated game's rules), the
generator only ever creates new files under the new game's own directory
— it never edits `gamesCatalog.ts`, `boards.ts`, `boardRegistry.ts`, or
any file outside the generated directory — so running it can never
corrupt or conflict with work in progress anywhere else in the repo.

## Acceptance criteria

1. Running the generator with a valid id (matching the `<slug>-v<N>`
   convention from tech-stack.md's "Rules versioning strategy") and a
   display name creates
   `packages/game-core/src/games/<slug>/{gameDef.ts,index.ts,BoardComponent.tsx,BoardComponent.module.css,gameDef.test.ts,<slug>Module.conformance.test.ts}`
   from the template, with the id/display name/type names substituted
   throughout.
2. Running the generator with an id that does not match `<slug>-v<N>` (no
   version suffix) is rejected with an explanatory error before any file
   is written.
3. Running the generator with an id that collides with an existing
   directory under `packages/game-core/src/games/` is rejected before any
   file is written — no partial/overwritten output.
4. The generated module, with zero hand-edits, passes
   `npm run typecheck --workspace=packages/game-core` and
   `npm run test:unit --workspace=packages/game-core` (its placeholder
   `gameDef.test.ts` and conformance test both pass against the
   placeholder no-op rules).
5. The generated module is **not** referenced anywhere in
   `gamesCatalog.ts`, `boards.ts`, or `boardRegistry.ts` after generation
   — confirms the "no existing file is touched" guarantee (story 3)
   structurally, not just by claim.
6. After generation, the tool prints a checklist listing the exact three
   registration edits (file + snippet) from "Why three, not one" above,
   and a one-line reminder of the edition-vs-new-catalog-entry heuristic
   with a pointer to tech-stack.md.
7. The template's placeholder `GameModule` is a real, minimal, valid game
   (e.g. a single no-op move, `minPlayers = maxPlayers = 2`, no
   `endIf`/`playerView`) — not dead code — so a developer can manually
   register it and see it actually mount and accept a move in the room UI
   before writing any real rules, as a sanity check that the scaffold
   itself works end-to-end.
8. Generating a game whose id uses characters outside `[a-z0-9-]` (e.g.
   spaces, uppercase, path-traversal characters like `..` or `/`) is
   rejected before any file is written or path is constructed.

## Non-goals

- Any shared board UI kit (hand tray, card component, opponent-info
  badges). Deferred per roadmap.md's own placeholder note on Love Letter —
  extract from two real implementations, don't design ahead of them.
- Auto-editing `gamesCatalog.ts`, `boards.ts`, or `boardRegistry.ts`. See
  plan.md for why this is a deliberate choice, not a deferred one.
- Any rules-engine template narrower than "a trivial valid GameModule"
  (e.g. a "card game template" or "phase-based template") — there is only
  one real game to generalize from today; a second template variant is
  premature until Love Letter (features 014/015) ships and a real pattern
  exists to extract.
- A settings-schema template/example — no shipped game uses
  `settingsSchema` yet (see feature 013, the generic settings-form
  feature this same planning pass added to the roadmap).
- Removing or renumbering an existing game module (this tool only adds).
- Any interactive/prompted CLI UX (inquirer-style prompts). Plain
  positional CLI arguments only, consistent with this repo's existing
  "no heavier tool than necessary" tooling philosophy (tech-stack.md,
  "Workspace tooling").

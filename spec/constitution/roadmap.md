# Roadmap

Features are ordered strictly by **dependency**, not by priority: each
feature below assumes every feature above it is complete, because it either
consumes an interface the earlier feature defines or validates that
interface end-to-end.

## 001 — Platform core

The shared foundation every game plugs into. No specific game ships as
part of this feature. Delivers:

- Identity: nickname + client-side session (`User`), per
  tech-stack.md's Phase 1 identity design.
- Room creation and joining via a private, shareable invite code.
- Seat claiming, including multi-seat claiming gated by
  `Room.allowMultiSeat`, and solo play as a special case of multi-seat
  claiming (one user claims every seat).
- The `Room` state machine (`lobby` / `in_game`), including the
  game-change-resets-seats and match-end-preserves-seats rules.
- Presence and reconnection: per-seat connection tracking, grace-period
  timer, release-by-host, the room-presence broadcast channel, and the
  client-side seat-credentials store in `localStorage`.
- The permissions model (`ROOM_PERMISSIONS` / `canPerform`), enforced on
  every room action.
- Generic wiring for boardgame.io's `Server` (SocketIO transport, pluggable
  `StorageAPI`) and `Client` mounting on the frontend, built against the
  `GameModule` contract — but with no real `GameModule` registered yet
  beyond the test fixture used by the conformance suite.
- The `GameModule` contract itself and the generic conformance test suite
  (`packages/game-core/testing/conformance.ts`), since every subsequent
  feature depends on this contract existing and being correct before any
  game is built against it.

This feature is the dependency root for everything else in this roadmap:
no game can be added until the catalog mechanism, chrome/board split, and
room/seat/presence machinery it plugs into all exist.

## 002 — Tic-Tac-Toe

A minimal, intentionally trivial `GameModule` (2 players, no
`settingsSchema`) whose entire purpose is to validate the platform core's
`GameModule` contract end-to-end: catalog registration, the chrome/board
split, and the conformance suite, before any game with real complexity
(hidden information, phases, multiple settings) is attempted.

If implementing Tic-Tac-Toe requires touching anything in
`packages/server` or `packages/client` outside of its own game module and
its one line in `gamesCatalog`, that is a signal the platform core's
contract has a gap — not something to special-case around.

## 003 — UI Styling

Not part of the original dependency-ordered sequence below — inserted
ahead of it by explicit user priority once feature 002 proved the
`GameModule` contract holds for a real game. Establishes a global
stylesheet for the platform chrome and a per-game CSS convention (scoped,
colocated with each game's `BoardComponent`), validated by fixing
Tic-Tac-Toe's board to render as an actual 3x3 grid. Depends on feature
002 existing (needs a real `BoardComponent` to restyle) but has no
dependency relationship with the hidden-information/settings-game
candidates below — it could equally have been sequenced after either of
them; it was prioritized here purely because the current unstyled UI was
the more pressing problem.

## 004 — Theme Switching

Genuinely dependency-ordered (unlike 003's insertion): this feature adds a
light/dark theme toggle on top of the CSS custom-property design tokens
feature 003 establishes in `global.css`. It cannot be built before 003
exists, since there would be no token layer to swap values on. Explicitly
deferred out of 003's own scope (listed there as a non-goal: "the design
tokens should be reasonable to re-theme later, but no toggle UI is built
now") — this is that deferred work, picked up once a user asked for it.
Planned now (spec.md + plan.md); implementation follows after 003 actually
ships, per the same spec → plan → tasks rhythm as every other feature.

## 005 — Spectator Live View

Not part of the original dependency-ordered sequence — inserted after an
explicit user-requested audit of feature 001's spec.md against its actual
implementation turned up two gaps between what was promised and what was
built (the other is 006, below). Story 5 and AC9 of feature 001's spec.md
promise that a room member with no claimed seat can observe the match live,
mounted as a real boardgame.io spectator (`playerID: undefined`). The
shipped implementation never did this — `GameMount` renders a static
"Spectating…" placeholder instead of a live board, an intentional shortcut
acknowledged at the time in feature 001's own `tasks.md` ("AC9 → covered
structurally rather than by one dedicated test"). This feature closes that
gap: mount a real spectator `Client()` and feed its live state into
`GameMount` the same way a claimed seat's state already is. Depends only on
feature 001's existing `Client`/`GameMount` machinery — no new platform
interface, no game-specific work (validated against Tic-Tac-Toe from
feature 002, the only real game that exists so far).

## 006 — Voluntary Seat Release

Also surfaced by the same feature-001 audit as 005. `leaveSeat` is a fully
working server route and a granted permission for both `host` and `member`
(`ROOM_PERMISSIONS`), and even has a client API wrapper
(`roomApi.leaveSeat`) — but no UI ever calls it. A member who claims a seat
today has no way to give it up themselves; only the host's `manageSeats`
release can free it. This feature just wires the already-built pieces
together: a "Leave seat" control on a seat the current user occupies.
Depends only on feature 001's existing `leaveSeat` action — no new
platform interface.

## 007 — Room Membership: Leave & Kick

New user-requested scope, planned ahead of implementation (not triggered by
the feature-001 audit that produced 005/006, though it lives in the same
"room management was under-built" vein). Two related `Room.members`
mutations, bundled into one feature because they share the same cascade
logic (removing a member also frees every seat they hold — same mechanism,
different trigger):

- A member can leave the room entirely (not just a seat) via a "Leave room"
  button; this unclaims every seat they held.
- The host can kick any other member out of the room entirely; this too
  unclaims every seat the kicked member held. Activates the `kickPlayer`
  permission that has existed in `ROOM_PERMISSIONS` since feature 001 but
  was never wired to a route or UI.

Resolved up front (asked the user rather than guessed, since it's a data-
model decision): the host **cannot** leave the room (no succession logic
needed — `leaveRoom` is member-only); a kicked player **is not** banned and
can rejoin later with the same invite code (no ban-list state to add).

## 008 — Seat Picker UI

Not part of the original dependency-ordered sequence — added by explicit
user request while fixing a solo-play bug in feature 001 (the free-text
"seat number" input in `ClaimSeatForm` made claiming multiple seats
error-prone and gave no indication of how many seats a game actually
has). Replaces the free-text input with one button per seat, from `0` to
`gameModule.maxPlayers - 1`, rendered once a game is selected; clicking
an open seat's button claims it directly. Depends only on feature 001's
existing `claimSeat` action and `GameModule.maxPlayers` — no new
platform interface. Deliberately sequenced after 005/006/007 per user
priority: the room-management gap fixes take priority over this
cosmetic/UX improvement.

## 009 — Gameover Banner

Not part of the original dependency-ordered sequence — inserted by explicit
user request after noticing that no game (including Tic-Tac-Toe) tells a
player anything when a match ends; `BoardComponent`s stop accepting moves on
`ctx.gameover` but nothing renders it. Formalizes `GameoverResult` (the
shape Tic-Tac-Toe's `endIf` already returns, `{ winner }` / `{ draw: true }`)
as a platform-wide contract and adds one generic `GameoverBanner` rendered
by `GameMount`, so every game gets a win/lose/draw message for free without
writing any gameover UI itself. Zero changes to Tic-Tac-Toe's `gameDef.ts`
are required — this only formalizes and consumes a shape that already
exists. Deliberately does **not** attempt genre-shared board widgets (hand
trays, opponent card counts, etc.) — see the discussion at the top of
`009-gameover-banner/spec.md`'s Description for why that's a distinct,
deferred problem: those need a second real game to validate their shape
against, which doesn't exist yet (Love Letter, below, is still unspecced).
Depends only on feature 001's existing `GameMount`/`BoardProps` machinery —
no new platform interface beyond the one type it adds.

## 010 — i18n Support

Not part of the original dependency-ordered sequence — inserted by explicit
user request now that the platform is starting to accumulate enough
platform-chrome surface area (rooms, seats, presence, the gameover banner
from feature 009) to be worth translating before it grows further. Adds
`react-i18next` to `packages/client`, extracts every platform-chrome string
(plus Tic-Tac-Toe's `GameModule`, which turns out to need zero changes — its
`BoardComponent` renders only `X`/`O` marks) into translation keys for
English and Spanish, and adds a manual language switcher that structurally
mirrors feature 004's theme-toggle pattern (a plain hook, a `localStorage`
key, a pre-paint script in `index.html`) rather than introducing a new
Context/Provider pattern. The one genuinely hard part is `GameoverBanner`'s
dynamic, pluralized winner messages (win vs. wins depending on winner
count, interpolated name lists) — handled via i18next's `count`-based
pluralization rather than string concatenation, since concatenation breaks
for languages with different word order. Depends only on feature 004's
existing theme-toggle precedent (structural template, not a code
dependency) and feature 009's `GameoverBanner` (the component being
translated) — no new platform interface.

## 011 — Game Module Scaffolding

Not part of the original dependency-ordered sequence — inserted by explicit
user request, ahead of Love Letter (below), specifically to make adding
Love Letter (and every game after it) start from a generated, compiling
skeleton instead of hand-copied boilerplate. Adds a template
(`packages/game-core/templates/new-game/`) and a small generator script
(`npm run new-game -- <id> "<Display Name>"`) that scaffolds the five files
every `GameModule` needs and prints a checklist of the three registration
points a new module must be wired into by hand (`gamesCatalog.ts`,
`boards.ts`, `boardRegistry.ts` — three, not the one file feature 002's
entry above describes, per a real split introduced by a feature 003
incident; see this feature's own spec.md for why). Deliberately scoped to
the **contract-required plumbing only** — it does not attempt a shared
board UI kit or any rules template narrower than "a trivial valid game,"
both of which stay deferred until a second and third real game exist to
generalize from (see 015, below). Depends only on feature 001's existing
`GameModule` contract and conformance suite — no new platform interface,
no changes to any existing game.

## 012 — Room & Match Chat

Not part of the original dependency-ordered sequence — inserted by explicit
user request. Reverses mission.md's original MVP exclusion ("Spectator
chat or any chat system") now that the platform has enough of a
room/seat/spectator model (features 001, 005) to make chat worth building
against. One merged chat channel per room, carrying both free-text player
messages and system-generated game-status messages (e.g. "Player A is
defeated", "Player C chooses to pass") — with spectator messages filtered
out of seated players' view, so a spectator's commentary can never leak
strategy-relevant chatter to someone still playing. Depends on feature
001's room/member model and feature 005's spectator model; produces the
system-status-message channel that feature 014 (Love Letter's rules
engine) is the first game to actually populate with real per-move
messages.

## 013 — Generic Game Settings Form

Not part of the original dependency-ordered sequence — surfaced while
planning Love Letter (below), not requested for its own sake. Closes a
real, previously-invisible gap: `GameModule.settingsSchema` has existed
since feature 001 and tech-stack.md documents its contract in full, but
no code — server or client — ever implemented it (`POST /:roomID/settings`
only ever handled `allowMultiSeat`; no client component ever rendered a
settings form). Adds a small hand-written validator against the platform's
already-narrow `JSONSchema` subset (shared from `game-core` so server and
client can't validate a submission differently), the missing
`RoomService.setGameSettings` + route wiring, and a generic
`SettingsForm` component that renders one control per schema property
(flat `string`/`enum`/`boolean`/`number` only — no nesting). This is what
this roadmap's old placeholder ("014 — TBD: a game with a configurable
settingsSchema... to exercise the generic settings-form rendering path")
described, pulled forward because Love Letter turns out to need it, not
deferred further. Depends only on feature 001's existing `Room`/route
machinery — no new platform interface beyond `settingsSchema`, which
already existed.

## 014 — Love Letter: Rules Engine

The `game-core` half of Love Letter — a small hidden-information card
game, chosen as the next step up in complexity specifically to exercise
`playerView` filtering and the spectator hidden-information risk called
out in tech-stack.md, which Tic-Tac-Toe (no hidden information) cannot
validate. Two rules editions, Normal (21-card deck, 2-6 players) and
Classic (16-card deck, 2-4 players, a strict subset of Normal's card pool)
— per tech-stack.md's versioning heuristic, modeled as **one** catalog
entry (`loveletter-v1`) with an `edition` setting, since Classic's deck is
a subset of Normal's and neither changes turn structure, phases, or the
round/token win condition. Depends on feature 011 (scaffolded from its
skeleton), feature 012 (emits real `G.log` status-message entries into
the chat channel for the first time), and feature 013 (the `edition`
setting is this feature's first real settings-form consumer).

## 015 — Love Letter: Board UI, Round Tracking & Private Reveals

The `packages/client` half of Love Letter, depending on 014's rules engine
existing first (its `BoardProps<LoveLetterG>` shape isn't final until
then). Hand display, target-selection UI for cards that need one, the
per-player round-wins-so-far display (players must be able to see this at
any time, per explicit user request), and the public/private reveal split
(e.g. a Baron comparison's result reaches every player as a public
`G.log`-driven chat message — "Player A used the Baron on Player B" — but
the actual compared card value reaches only Player A, rendered by this
`BoardComponent` from a `playerView`-filtered private field, never chat).
**Also the natural trigger point for a genre-shared board UI kit** (hand
tray, opponent card-count badges) deferred by feature 009 — once this
ships as a second real `BoardComponent`, shared pieces should be
*extracted* from the two real implementations, not designed speculatively
ahead of them. Also the first real test of feature 010's i18n contract
against actual in-board game text. Depends on feature 014.

## Later candidates (placeholders — not specced yet)

- **016 — TBD**: a game with a configurable `settingsSchema` field shaped
  like a house rule or turn timer (a `number`, not an `enum`) — feature
  013's generic form supports this shape already, but nothing has
  exercised it end-to-end yet; Love Letter's `edition` (014) only proves
  the `enum` case.

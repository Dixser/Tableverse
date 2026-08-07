# Feature 032 — Magaluf: Rules Engine

Rules source: **none**. Magaluf is an original game with no rulebook. Its
design was settled before this spec was written, in `prototypes/magaluf/`,
which holds a framework-free reference implementation, a Monte Carlo
simulator, and **`prototypes/magaluf/design.md`** — the authoritative design
document this spec is built from. Every number below traces to it, and every
number in it traces to a simulator run.

That ordering was deliberate. With no rulebook to paraphrase there was
nothing to write acceptance criteria *against*, so the design was built and
balanced first. Three findings from that work changed the game's shape rather
than its numbers, and are recorded in `design.md` §13 — they are the reason
several values here look arbitrary but are not.

This spec covers the rules engine only. The board UI is feature 033.

## Versioning classification (per tech-stack.md's heuristic)

**New catalog entry, `magaluf-v1`.** A push-your-luck game with a
nine-sub-round day/phase structure, per-phase withdrawal, unbanked scoring
that is forfeited on a failed end-of-day check, and permanent player
elimination shares no turn structure, phase shape, or win condition with any
existing module. It is not a superset of anything in the catalog.

`minPlayers: 3, maxPlayers: 6`. See "Resolved design decisions" for why 2 is
excluded and why 4–5 is the sweet spot.

## Description

### Structure

A weekend is **3 rounds** — Viernes, Sábado, Domingo — each with **3 phases**:
**Tardeo** → **Noche** → **After**. Nine sub-rounds in total.

There is deliberately **no boardgame.io phase machinery**. `G.day` and
`G.phase` are plain numbers, and phase/day transitions happen inside the move
that causes them, in the same way Cahoots keeps its whole turn in one move.
The framework owns only the seat rotation, via a custom `TurnOrderConfig`.

Withdrawal is **per phase**: a player who sits out the Noche rejoins for the
After. Intoxication and unbanked VP accumulate across all three phases of a
day.

### Turn structure

Round-robin among seats still `partying`. On a turn a player takes exactly
one of:

| Move | Effect |
|---|---|
| `drink` | Draw 1 Alcohol card → apply its Intoxication and VP → draw 1 Event card and resolve it. Ends the turn. |
| `withdraw` | Leave this phase. Applies the Aguafiestas penalty if below the drink minimum. Ends the turn. |
| `useItem(item)` | A free action, **max one per turn**. Does *not* end the turn, with two exceptions below. |

`useItem` exceptions: **Porro** ends the turn without drawing anything (that
is its whole effect), and **Farlopa** ends the turn only if its extra draw
takes the player to the phase drink cap.

Because item use does not end the turn, `turn` must **not** use
`minMoves`/`maxMoves`. Moves call `events.endTurn()` explicitly.

A player who reaches the phase's drink cap is auto-withdrawn ("closing
time"). The phase ends when no seat is `partying`.

Drinks a player did not choose — a Ronda, a Chupito de la casa — still count
toward their phase drink total.

The starting seat rotates each phase: `(day * 3 + phase) % activeSeatCount`.

### Information and the Drinking Limit

One limit card is drawn face-down each morning, shared by all players, and
revealed at the start of the phase named by `limitRevealAt` (default
`after`).

| Day | Limit deck |
|---|---|
| Viernes | 26 / 27 / 28 / 29 |
| Sábado | 20 / 23 / 26 / 29 |
| Domingo | 14 / 18 / 22 / 26 |

The **spread widens** rather than the level falling. Lowering the limit does
almost nothing to the death rate because players scale their drinking to it;
what kills people is being wrong about the number while it is face-down
(`design.md` §6).

**`G.limit` is the only hidden state in the game.** Everything else —
intoxication, VP, items, Resaca, drink counts — is public. A player who spends
a **Red Bull** sets their own `peekedLimit` flag and sees the real value; that
flag is the only per-player secret. `playerView` therefore replaces `limit`
with `-1` unless `G.limitRevealed` or that player has peeked, and always hides
it from spectators until revealed.

### Scoring, Resaca, and banking

VP earned during a round is **unbanked** (`roundVP`). It banks permanently
only on surviving that night, and is multiplied by the day's rate on banking:

| Day | VP multiplier |
|---|---|
| Viernes | ×1 |
| Sábado | ×1.5 |
| Domingo | ×2.25 |

Intoxication resets each morning **to the player's accumulated Resaca**, not
to zero. Resaca is permanent and only ever grows:

| Source | Resaca |
|---|---|
| Vomitona (−4 Intoxication now) | +3 |
| Ambulancia (−5 Intoxication now) | +4 |
| Surviving a balconing jump | +4 |
| Farlopa | +3 |

### Balconing

At the end of each round, any surviving, non-arrested player whose
Intoxication **exceeds** the limit jumps. Let `d = intox − limit` (`d ≥ 1`):

```
P(pool) = clamp01( basePoolChance − (d − 1) × poolDecay )
```

Defaults `0.70` and `0.12`, giving 70% at `d = 1` falling to 0% at `d ≥ 7`.

**Both outcomes forfeit the entire round's unbanked VP and all items.**

- **Piscina** — survives. Banks `3 + d` VP (the Leyenda bonus, unmultiplied),
  takes Resaca 4, plays on.
- **Cemento** — dead. Out for the remainder of the weekend. Previously banked
  VP is kept.

Jumping is never worth planning for: expected value peaks at 2.90 VP at
`d = 2` against a median round pool of ~39 VP.

### Decks

Alcohol and Event decks are both **per phase**, rebuilt and reshuffled at the
start of every phase. Full catalogues in `design.md` §7 and §11.

| Phase | Alcohol deck | Mean Intoxication | Event deck |
|---|---|---|---|
| Tardeo | 34 | 1.59 | 34 |
| Noche | 34 | 2.71 | 42 |
| After | 28 | 4.07 | 50 |

Event decks are tiered, not shared: five families (Ligue, Fiesta, Pelea,
Chungo, Castigo) have a distinct card per phase with escalating reward and
cost. This is what makes the phase economy strictly rising — 1.20 / 1.24 /
1.53 VP per point of intoxication.

Deck sizes exceed the maximum possible draws per phase at 6 players, so a
mid-phase reshuffle should never occur; the engine still handles it, and the
simulator asserts it never fires.

### Phase caps and exit rules

| Phase | Max drinks | Min drinks | Aguafiestas | Último en Pie |
|---|---|---|---|---|
| Tardeo | 4 | 2 | −2 VP | +2 VP |
| Noche | 5 | 3 | −4 VP | +3 VP |
| After | 4 | 1 | −5 VP | +5 VP |

**Último en Pie** goes to the last seat to leave the phase, and requires
meeting the drink minimum — otherwise a player could hold two Porros and idle
to the bonus without drinking.

### Items

| Item | Effect | Contraband |
|---|---|---|
| Kebab | −3 Intoxication | no |
| Botella de agua | −2 Intoxication | no |
| Red Bull | Peek at the limit | no |
| Porro | Skip your draw this turn without withdrawing | yes |
| Pastis | Double your next drink's VP, +2 Intoxication | yes |
| Farlopa | Take an extra drink at halved Intoxication (floor); Resaca +3 | yes |

### The police

Both reach only seats that are still `partying` — a player who has gone home
is not raided. This also closes a loophole where holding contraband and
withdrawing early would let a Redada bank your VP and cancel your limit check
for free.

- **Cacheo** — every partying contraband holder discards it and loses 3 VP.
- **Redada** — every partying contraband holder is **arrested**: banks their
  round VP at the day's rate immediately, is out for all remaining phases of
  that day, is **not** charged the Aguafiestas penalty, and faces **no limit
  check that night**. Released the next morning. If nobody holds contraband,
  nothing happens.

An arrest is therefore sometimes a rescue, and that lifeline is earned by
choosing to carry contraband rather than granted for being drunk.

### Room settings

Exposed via `settingsSchema` and resolved in `setup`:

| Setting | Type | Default | Range |
|---|---|---|---|
| `limitRevealAt` | enum | `after` | `tardeo` \| `noche` \| `after` \| `never` |
| `basePoolChance` | number | 0.7 | 0.1 – 1 |
| `poolDecay` | number | 0.12 | 0 – 0.5 |
| `limitShift` | number | 0 | −10 – +10 |
| `saturdayMultiplier` | number | 1.5 | 1 – 3 |
| `sundayMultiplier` | number | 2.25 | 1 – 4 |

**Every numeric setting must be clamped in `setup`.** This is load-bearing,
not defensive habit: `validateGameSettings`
(`packages/game-core/src/settingsValidation.ts`) checks a value's *type* but
ignores `minimum`/`maximum`, so a host can submit any number the form
accepts. The schema still declares ranges, to document intent and to work
automatically if the platform's validator ever gains range checking.

### Win condition

Highest `bankedVP` after Sunday's resolution. Dead players score what they
banked on nights they survived. Ties break on highest total Intoxication
survived across the weekend; a tie surviving that returns all tied seats in
`GameoverResult.winner` as an array.

## Resolved design decisions

- **Balconing is a roll, not instant death.** Instant death made the leader's
  risk cheapest exactly when it should be dearest. Round-banking plus a
  survival roll means Sunday's After — the largest unbanked pile in the game
  — is the most dangerous thing the leader owns.
- **The lasting cost of relief is Resaca, not a modifier on the limit.** Both
  are mathematically identical; Resaca keeps everything in one currency
  moving in one direction, and shows the damage on the counter players
  already watch. Expressing it as immediate intoxication instead was
  considered and rejected: it would delete the cross-day trade entirely and
  break the jump-survivor scar, since intoxication resets each morning.
- **Death is permanent.** The user chose lethality over pacing comfort. The
  survival roll and a near-safe Friday are what keep a permanent elimination
  from arriving too early: 8.8% of players die on Friday.
- **Day VP multipliers exist because a shrinking limit does not create
  danger.** Three separate experiments confirmed a rational player's death
  rate is roughly constant no matter what is done to their capacity. Danger
  had to come from temptation. The multiplier also fixed the Sunday leader
  winning 78% of games (now 61%).
- **Event decks are tiered by phase.** Reusing one card across phases meant a
  Tardeo draw and an After draw paid the same, while cheap Tardeo drinks
  bought far more draws per point of capacity. This is what made the phase
  economy monotonic.
- **`minPlayers: 3`.** Forced-consumption events (Ronda above all) hit
  everyone still partying, so unavoidable intoxication scales with table
  size. At 2 players there is almost none and every drink becomes a decline-
  able choice: 11% death rate, 7/15 balance targets. Dropping the whole limit
  deck by 7 points still only reached 15.7%, confirming it is structural. 3 is
  playable but tame (21.9% dead by Monday); 4 hits 15/15.
- **Settings are raw numeric dials rather than named presets.** Chosen by the
  user for maximum experimental range during playtesting, accepting the
  longer form and the clamping requirement.
- **The Camello hands over a random contraband item.** Letting the player
  choose needs a pending-decision stage. Deferred, and noted as a candidate
  for a follow-up now that boardgame.io stages make it cheap.
- **The conformance suite's `secretKeys` is passed empty, deliberately.** That
  check models secret data as `Record<PlayerID, unknown>` — one entry per
  player, like Cahoots' `hands` — and verifies no viewer sees another owner's
  entry. Magaluf's only hidden state is `G.limit`, a single global number
  everyone is equally in the dark about, which that shape cannot express:
  passing it would fail the suite's own `isPlainRecord` assertion rather than
  test anything. AC17 covers the limit's visibility explicitly instead. This
  is a gap in the shared suite (it has no notion of globally hidden state),
  not in this game's coverage.
- **Log entries carry card names via `descriptionKey`.** `ChatPanel` already
  renders a second nested translation from that param — the affordance Cahoots
  uses for goal text — so no platform change was needed to get card names into
  the feed, and the engine still holds no display strings.

## User stories

### 1. Deciding whether to have one more

As a seated player, on my turn I can see my own intoxication, everyone
else's, how many drinks I have had this phase, and — once revealed — the
day's limit, so that choosing between another drink and withdrawing is an
informed gamble rather than a blind one.

### 2. Discovering I am already over

As a seated player, when the limit is revealed at the start of the After and
I am already above it, I can see exactly how far over I am and what my
survival odds are, so that I can decide whether to keep drawing in the hope
of a Kebab or withdraw and hope I miscounted.

### 3. Being saved by the police

As a seated player carrying contraband, when a Redada is drawn I am arrested,
my round's VP is banked immediately, and I face no limit check that night —
so a card that usually ruins my evening occasionally saves my life.

### 4. Paying tomorrow for surviving tonight

As a seated player who vomits on Friday, I start Saturday and Sunday already
part-way to the limit, so that every relief mechanic is a trade across days
rather than a free escape.

### 5. Going over the balcony

As a seated player whose intoxication exceeds the limit at the end of a day,
I forfeit the round's VP and my items, and a single roll decides whether I
survive with a Leyenda bonus or am eliminated for the rest of the weekend.

### 6. Watching after dying

As an eliminated player, I keep the VP I banked on nights I survived, remain
in the room as a spectator, and my seat neither blocks nor is skipped
incorrectly in the turn rotation.

### 7. Tuning the game between playtests

As a host, I can adjust the reveal timing, the survival curve, the limit
level and the weekend's VP arc from the room's settings form before starting
a match, so that a group can find its own sweet spot.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against this feature's `Game`
definition. `[conformance]` denotes the shared conformance suite.

1. `[unit]` A weekend runs exactly 3 days × 3 phases, and the match ends after
   Sunday's resolution or when every seat is dead, whichever comes first.
2. `[unit]` `drink` applies the alcohol card's intoxication and VP, then
   resolves exactly one event card, then ends the turn.
3. `[unit]` `useItem` does not end the turn for Kebab, Botella, Red Bull or
   Pastis; it ends the turn for Porro; and for Farlopa only when the extra
   draw reaches the phase drink cap.
4. `[unit]` A second `useItem` in the same turn is rejected (`INVALID_MOVE`).
5. `[unit]` Porro consumes the turn without drawing, without withdrawing, and
   without incrementing `drinksThisPhase`.
6. `[unit]` Farlopa halves only its own extra draw (floor); a normal `drink`
   in the same turn takes full intoxication.
7. `[unit]` Withdrawing below the phase's drink minimum applies the
   Aguafiestas penalty; withdrawing at or above it does not.
8. `[unit]` Último en Pie is paid to the last seat to leave a phase only when
   that seat met the drink minimum.
9. `[unit]` Reaching the phase drink cap auto-withdraws the player.
10. `[unit]` Intoxication resets each morning to the player's Resaca, never to
    zero and never below zero at any point.
11. `[unit]` Surviving the night banks `round(roundVP × dayMultiplier)`;
    balconing forfeits the whole round pool on both outcomes.
12. `[unit]` A surviving jumper banks `legendBase + d`, gains Resaca 4, and
    stays alive; a failed jump sets the seat dead and pays no bonus.
13. `[unit]` No jump is ever recorded at `d < 1`, and a player at exactly the
    limit survives.
14. `[unit]` A Redada arrests every partying contraband holder, banks their
    round VP at the day's rate, charges no Aguafiestas penalty, and cancels
    that night's limit check; with no contraband on the table it has no
    effect.
15. `[unit]` An arrested player is out for the remaining phases of that day
    and plays normally the next morning.
16. `[unit]` `limitRevealed` becomes true at the start of the phase named by
    `limitRevealAt`, and never when it is `never`.
17. `[unit]` A player who spends a Red Bull sees the real limit while other
    seats and spectators still do not.
18. `[unit]` Every numeric setting outside its declared range is clamped in
    `setup` rather than reaching game logic.
19. `[unit]` The turn rotation skips dead, withdrawn and arrested seats, and
    consumes a `skipNextTurn` flag exactly once.
20. `[unit]` `endIf` returns a `GameoverResult` whose `winner` is the highest
    `bankedVP`, with ties broken on intoxication survived and unbreakable ties
    returned as an array.
21. `[unit]` No mid-phase deck reshuffle occurs in a full match at
    `maxPlayers`.
22. `[unit]` Every `G.log` entry carries a `magaluf.*` key, and no entry
    describing the match ending carries a `sound`.
23. `[unit]` Every key the engine can name — derived from the card data, and
    separately collected from played-out weekends — has a non-empty string in
    **both** `en.json` and `es.json`.
24. `[conformance]` `testGameModuleConformance(magalufModule, { secretKeys:
    [] })` passes at both `minPlayers` and `maxPlayers`.

## Non-goals

- **The board UI.** Feature 033.
- **2-player support.** Structurally unbalanced; excluded by `minPlayers: 3`
  rather than shipped broken. A non-player "guiri" seat that triggers Rondas
  is the obvious fix if it is ever wanted, and would need its own spec —
  `tech-stack.md` notes boardgame.io has no first-class non-player actor.
- **AI opponents.** The bot policies in `prototypes/magaluf/src/bots.ts` exist
  only to drive the simulator and are not ported.
- **Choosing which contraband the Camello gives.** Deferred; see resolved
  decisions.
- **A live jump animation or any dramatisation of the roll.** The engine
  resolves the jump within the move that ends the day and records the result
  in `G.jumps`; presenting that moment is feature 033's problem.
- **Range validation in the platform's settings validator.** Adding
  `minimum`/`maximum` support to `validateGameSettings` would benefit every
  game and remove the clamping requirement, but it changes shared platform
  behaviour and belongs in its own feature.

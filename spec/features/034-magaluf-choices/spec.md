# Feature 034 — Magaluf: playtest balance pass

## Description

Four rule changes to `magaluf-v1`, all from the same playtest finding: the
game's randomness had no counterplay. Every one of them gives a player a lever
where before they only had an outcome.

As with feature 033's amendments, these land as changes to `magaluf-v1` rather
than a `magaluf-v2`. `tech-stack.md` forbids mutating a published version *once
real matches are recorded against it*, because boardgame.io replays the move
log against the `Game` definition. Magaluf has only ever been played at the
table and in the simulator, so no recorded match exists to corrupt.

## What the playtests found

1. **The per-day limit decks punished the unlucky twice.** `LIMIT_DECKS`
   narrowed across the weekend (viernes 26–29 → domingo 14–26) while `resaca`
   carried forward as an intoxication floor. A player who drew a Vomitona on
   Friday met Sunday's 14 with capacity they never chose to spend, was forced
   out of every phase early, and lost the day the 2.25× multiplier makes
   decisive.
2. **Resaca was inflicted, never chosen.** All four sources applied it
   unilaterally and the field was documented as a floor that only ever grew.
   The only counterplay was leaving the venue.
3. **Event RNG had no steering.** All 36 cards were pure outcome, so a player
   who drew cheap alcohol and expensive events could not close the gap.
4. **Último en Pie rewarded seat position.** The bonus went to the highest
   `withdrawSeq`. A table that all withdrew at the drink minimum left in turn
   order, so the last seat collected for free.

## The changes

### A. One limit deck for the whole weekend

`LIMIT_DECKS` (three decks of four) becomes `LIMIT_DECK = [16, 19, 22, 25, 28]`.
The weekend's arc is carried entirely by `DAY_VP_MULTIPLIER`, which is what
that constant's own comment already claimed.

Consequence for the board: `limitScale.ts` loses its `day` parameter
throughout, and with it `IntoxMeter` and `PlayerPanel` lose a prop. The meter's
domain is now constant for the whole weekend, so the bar stops rescaling
overnight.

### B. Resaca is reducible

New `addResaca(player, amount)` primitive in `state.ts`, floored at zero,
replacing four direct `+=` sites. This is what lets a choice branch trade
points for hangover relief.

Tuning applied with it: `ambulancia` resaca **4 → 3**. It retargets to the
drunkest seat rather than the drawer, making it the last fully-unchosen source
in the game, so it should also be the mildest.

### C. Event cards with options

`EventCard` gains `options?: readonly EventOption[]`. Both a card and a branch
carry the same `EventEffects` payload, so one applier serves both. Branches may
additionally set the structural flags `leaves`, `extraDrink`, `doubles` and
`skips`.

Flow, mirroring the existing `pendingEvent` pattern exactly one step later:

    drink → pendingEvent → revealEvent → pendingChoice → chooseEventOption

Deliberately **not** a boardgame.io stage. The reveal step already proved that
"the table waits on one seat for one decision" works with this game's turn
order, and reusing it keeps `canAct` a single readable expression. A stage would
only be needed for a choice belonging to a seat other than the drawer — which
is why `ambulancia` stays a plain card (see the deferral below).

Three cards reworked in place, five added:

| Card | Archetype | Option A | Option B |
|---|---|---|---|
| `vomitona` | two penalties | `vomitar` — relief 4, resaca +3 | `aguantar` — intox +2 |
| `chungoNoche` | two penalties | `pagarLaCuenta` — vp −4 | `perderTodo` — losesItems |
| `terraza` | two bonuses | `subirALaTerraza` — vp 8, intox 3 | `quedarseAbajo` — vp 3 |
| `ultimaRonda` | two penalties | `unaMas` — intox +4 | `mananaLoPago` — resaca +2 |
| `resacon` | bonus+penalty / pass | `dormirla` — resaca −2, vp −3 | `seguirDeFiesta` — nothing |
| `invitacion` | two bonuses | `cobrarla` — vp +3 | `pillarKebab` — givesItem kebab |
| `dobleONada` | bonus+penalty / pass | `doblar` — extraDrink + doubles | `pasar` — nothing |
| `saltarLaCola` | bonus+penalty / pass | `colarse` — vp +7, leaves | `hacerCola` — nothing |

`doubles` reuses `player.pastisArmed`, so `consumeAlcohol` does the doubling —
there is no second "double this drink" rule. `extraDrink` uses
`drawAlcohol` + `consumeAlcohol` directly, the pair `ronda` and `chupitoCasa`
already use, and never draws an event: an event that drew an event would chain
without a fixed point.

Deck totals are held constant per venue (tardeo 36, noche 45, after 55) so
deck-exhaustion behaviour is unchanged. Slots come mostly from `nada` and from
the forced-drink cards, which are the right thing to trade away here — they are
the ones that spend a player's capacity without asking.

`saltarLaCola` is After-only: cashing out and going home is only a real
decision in the venue where leaving costs the biggest Último en Pie.

### D. Último en Pie is paid at a round boundary

The bonus now goes to a player who **begins a round as the only seat still
partying**, gated on `minDrinks` as before, paid at most once per phase. The
phase continues afterwards.

`advanceTurn` gains the boundary detection, because it is the only place the
turn ever moves. A lap is measured from `G.roundAnchor` (the seat that opened
the phase); walking is always forward, so the round has turned over whenever
the next seat's offset from the anchor is not further along than the current
seat's. The equal case is a solo seat handing to itself, which is correctly a
new round every turn.

`endPhase` no longer settles it.

The behaviour this buys: when the whole table leaves at the minimum, the last
seat is alone *mid-lap* and must spend one more solo turn — and the
intoxication that comes with it — to reach the next boundary. A table that all
hits closing time on the same lap now pays nobody, which is the rule working:
nobody was ever alone.

## Non-goals / deferred

- **Cross-seat choices.** A choice belonging to a seat other than the drawer
  (`ambulancia` asking its victim rather than the drawer) needs a boardgame.io
  stage with `activePlayers`, following Love Letter's Chancellor or Regicide's
  defend. Deferred; `ambulancia` keeps its unilateral effect.
- **The Camello choice** noted in feature 032 stays deferred for the reason
  given there: per-venue card counts express a dealer's mix that a single
  choice card could not.
- **Simulator parity.** `prototypes/magaluf/` still runs the old rules. Its
  balance numbers in `design.md` §13 no longer describe the shipped game.

## Acceptance criteria

- AC1 — One limit deck, drawn from on every day; the meter band is identical
  every day and still independent of the drawn card.
- AC2 — `addResaca` floors at zero; a branch removing 2 from a resaca of 1
  leaves 0.
- AC3 — A card with `options` is parked face-up in `G.pendingChoice`, not
  resolved, with the card visible in `G.lastDraw`.
- AC4 — `canAct` refuses every other move while a choice is owed; an answer
  from the wrong seat or an out-of-range index is `INVALID_MOVE`.
- AC5 — Each branch applies only its own effects.
- AC6 — `extraDrink` pours one alcohol card and draws no event; `doubles`
  doubles it and leaves `pastisArmed` false.
- AC7 — A branch that reaches `maxDrinks` ends the turn even when the pending
  event did not (the Farlopa path).
- AC8 — A branch with `leaves` withdraws the player without the Aguafiestas
  penalty, and their VP stays at risk rather than banked.
- AC9 — Último en Pie is paid when a solo seat opens a round having met
  `minDrinks`; not mid-lap, not below the minimum, not twice, and not at all
  when the venue empties in one closing-time sweep.
- AC10 — Every event, option, log and board key exists in both `en` and `es`.

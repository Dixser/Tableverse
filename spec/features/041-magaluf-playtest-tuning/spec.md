# Feature 041 — Magaluf: the playtest tuning pass

## Description

Five rules changes from new real playtests of Magaluf, taken as one pass
because they interact. Four of them remove certainty or swing from the
weekend; the fifth puts the escalation back somewhere it has to be earned.

| # | Change |
|---|---|
| 1 | The day multiplier is ×1 on all three days |
| 2 | The balcony die's highest face always clears |
| 3 | The limit deck is every integer in a host-set band |
| 4 | Último en Pie becomes **Cierrabares**, an end-of-phase top-drinker bonus |
| 5 | A Cacheo costs 3 VP **per** contraband item |
| 6 | The balcony stops being spoiled by the log |

Every one of them is a default change, not a capability removal. The Saturday
and Sunday multipliers are still room settings, so a table that liked the old
weekend can dial it straight back in.

## 1. The flat weekend

`DAY_VP_MULTIPLIER` becomes `[1, 1, 1]`.

The escalation existed to give the weekend an arc, and the arc it gave was the
wrong one. Sunday paid so much better than Friday that Friday stopped being
worth playing carefully, and — worse — the multiplier rewarded *position*
rather than play: whoever happened to be ahead when the ×2.25 arrived had their
lead multiplied along with everything else. A player who lost a night early
could not be caught by anyone who had merely played worse on the day that
counted.

This leaves a hole, and it is worth naming rather than pretending otherwise.
`LIMIT_DECK` was flattened in an earlier pass *on the explicit grounds that the
multiplier was carrying the weekend's escalation*. Flatten both and Friday,
Saturday and Sunday become mechanically identical. Item 4 is what fills it.

## 2. The natural max always clears

`survivesRoll` becomes `roll > d || roll === faces`, and `poolChance` floors at
`1 / faces` where it used to reach zero.

At `d ≥ N` the old rule was arithmetically certain death — and the engine still
dealt the player the die and made them roll it. That is the worst of both: it
reads at the table as cruel dice when the outcome had in fact been settled the
moment the limit card came up. A natural max keeps the jump a real jump all the
way out, and costs the house one face in N in a band almost nobody reaches.

The rule is stated on the die's **top face**, not on the literal number 6,
because the die is a host setting spanning d4 to d20. A literal 6 would not
exist on a d4 and would sit at a strange 1-in-20 on a d20.

This costs `balconing.ts` an elegance it used to advertise: the die exactly
reproduced the continuous formula it replaced, `(N − d) / N`. With a floor that
identity is broken on purpose, which is the right way round for a game meant to
be played with the physical object.

## 3. The limit band

`limitShift` is removed. `limitMin` and `limitMax` replace it, bounds 5–40,
defaulting to 16 and 28 — exactly today's band. The deck is every integer
between them, inclusive.

Two things were wrong with five spaced cards. The board has only ever shown the
*band* ("between 16 and 28"), so a player who had read the rules could narrow
the hidden number to one of five while the header implied thirteen — a lie by
omission in the one piece of hidden information the game has. And `limitShift`
could move where the danger sat but never how wide it was; two numbers say
both.

`limitMin === limitMax` is legal and gives a fixed, publicly known limit. An
inverted pair resolves as `max = Math.max(min, max)`: the top end gives way, so
a host dragging one slider past the other finds the number they are moving
wins.

## 4. Cierrabares

Último en Pie is replaced. At closing time the player who drank **strictly
more** than anybody else that phase takes 3 / 6 / 9 VP by venue.

The old rule paid for being alone at a round boundary, which had two problems.
It measured endurance in *turns* rather than in drinks, so a player nursing a
Porro through a solo lap collected while the player who had actually out-drunk
them did not. And it fired invisibly, mid-phase, off lap arithmetic nobody at
the table could follow — the log line was the first anyone knew of it.

A drink count fixes both. It turns on the number already printed on every
player panel, so the race is legible while it is being run, and it is settled
once, in the open, when the venue closes.

Decisions inside the rule:

- **At risk, not banked.** It goes into `roundVP` like everything else earned
  in a phase, so it still rides on that night's limit check.
- **Ties pay nobody.** With `maxDrinks` at 4/5/4 a contested bar often ends
  level, which makes the last drink of a tied phase worth taking.
- **The `minDrinks` gate survives**, for a new reason: the Aguafiestas penalty
  already punishes leaving under the minimum, and one act must not be punished
  and rewarded at once. There is no ambiguity about where the gate applies —
  the top count is at least everyone else's, so if it fails the minimum then
  nobody met it and no runner-up is waiting underneath.
- **Every seat counts**, however its phase ended.

3 / 6 / 9 is deliberately larger than the 2 / 3 / 5 it replaces. It is the only
one of these five changes that creates pressure to drink *more*, and it rises
through the night — so it carries the escalation item 1 removed, in a form that
has to be won against the table rather than collected by whoever is ahead.

## 5. The Cacheo is a rate

`cards.ts` still says `vp: -3`; it is now charged per contraband item held.
`items` is a plain list with no hand limit anywhere in the game, so a stash is
genuinely several items and used to cost exactly what one joint cost — the one
card that punishes contraband was indifferent to how much of it there was.

## 6. The log stops spoiling the balcony

Reported from play against this branch: the balcony is sequenced so the whole
table watches one jump at a time, but the chat feed had already announced every
outcome.

`resolveNight` rolls the entire night up front and *then* stands the table at
the first balcony. That order is right for the engine — no outcome can drift
while the overlay is open, and feature 034 deliberately moved the hold into the
engine so the gameover banner could not announce a winner over the top of the
roll deciding them. But `jump()` also narrated as it rolled, so all of it was in
the feed before anybody had turned a die over. The overlay was ceremony over a
spoiler.

The fix keeps the rolls where they are and moves the *narration* to
`leaveBalcony`, which is the single path both the ordinary walk and the host's
skip go through — so "exactly once per jump, in order" falls out of the control
flow rather than needing a flag. The lines read from the `JumpRecord`, which is
a snapshot, so writing them late cannot change what they say.

The log entries carry sound cues, so this also moves the death sting from
"before the modal opened" to "as the table moves on from it".

**And one piece of copy that was left behind by item 2.** The overlay told the
jumper `you need more than {{over}}` — printed, at `d = 49`, next to a 17%
badge. Both numbers were true and together they read as nonsense: the sentence
describes the pre-041 rule, where beating `d` was the only way out. Past
`d = die` it now says only the top face clears, which is the same rule stated
the way it actually applies.

## What this does to the weekend, overall

Worth stating plainly, because it is the thing to watch in the next playtest.
Changes 1, 2 and 3 all remove swing: flatter scoring, fewer deaths, less
deducible danger. Change 4 pushes hard the other way and change 5 sharpens one
existing punishment. The bet is that pressure applied *within* a night, by a
prize somebody has to out-drink you for, plays better than pressure applied
*across* the weekend by an arithmetic rate.

The `COMEBACK` probe figures (median winning score ~66, median gap ~44) were
measured on the escalating weekend and are now stale in a known direction: a
flat weekend should compress the winning score. They need re-probing before
either catch-up dial is touched again.

## Non-goals

- **Removing the multiplier settings.** They stay so the old weekend remains
  reachable, and so the next playtest can compare without a code change.
- **Flooring VP at zero.** `gainVP` has no floor and `bankRound` no clamp, so a
  seat caught holding four contraband can bank a negative day. That is
  pre-existing and consistent with the early-exit penalty; the per-item Cacheo
  only makes it reachable. Flagged, deliberately unchanged.
- **Re-tuning `COMEBACK` or the card counts.** Named as stale above; changing
  them in the same pass would make the playtest unreadable.
- **A tie banner.** A tied phase pays nobody and says so in the log. Giving a
  non-event its own board furniture would overstate it.

## Acceptance criteria

- AC1 — `dayMultipliers(DEFAULT_SETTINGS)` is `[1, 1, 1]`, and a day banks at
  face value on Saturday exactly as it does on Friday.
- AC2 — A host can still set Saturday 1.5 and Sunday 2.25.
- AC3 — A roll equal to the die's face count clears the terrace at any `d`;
  `poolChance` floors at `1 / faces` and never returns 0.
- AC4 — The limit deck contains every integer in `[limitMin, limitMax]`, and
  the drawn limit is always one of them.
- AC5 — `clampSettings` clamps each end into 5–40 independently, then raises
  `limitMax` to `limitMin` if they cross.
- AC6 — Cierrabares pays the unique top drinker `cierrabaresBonus` into
  `roundVP`; a tie pays nobody; a top count below `minDrinks` pays nobody.
- AC7 — Drink counts reset at every venue for **every** seat, including
  arrested and dead ones.
- AC8 — The winner is shown on the board between closing time and the next
  venue opening, naming the seat, the drink count and the VP.
- AC9 — A Cacheo charges `3 × items held` and logs the count and the total.
- AC10 — No jump outcome reaches the log until the table has been walked past
  that jump, including after the jumper has turned their own die face-up.
- AC11 — Every jump is logged exactly once and in order, including the ones a
  host skips past.
- AC12 — The overlay names the top face as the target once `d >= die`, and the
  number to beat below that.

## Verification

All twelve are unit tests: 836 → 851 in `game-core`, all green, with `typecheck`
clean and `lint` unchanged from `main` (13 pre-existing problems, all in
`prototypes/`).

The new assertions were then checked by mutation — each rule was reverted to
its old behaviour in turn and the suite re-run, to confirm the tests fail when
the rule is not there rather than agreeing with the engine by accident. Eight
mutations, eight caught. The first run caught only seven: nothing asserted the
flat multiplier, because the test written for it measured Friday, where ×1 was
never in question. It was rewritten to cross midnight and measure Saturday
against Friday, and the mutation is now caught by two tests.

Checked in the running app, two seats, a band pinned to 5 so the night was
certain to reach a balcony:

- The settings form renders the two new number fields at 16 / 28 and both
  multipliers at 1. Typing `limitMin: 30` against `limitMax: 28` and saving
  started a match at `limitMin: 30, limitMax: 30` with the header reading
  "entre 30 y 30" — the cross-field clamp end to end.
- A tied Tardeo showed no banner and logged "Nadie cierra el bar — empate a
  copas."; a 5–3 Noche showed "Dani cierra el bar con 5 copas — +6 PV en juego."
- Both seats far over the limit showed a **17%** risk badge, which is the
  `1/N` floor where the old curve read 0%.
- At the balcony, with `balcony: { index: 0, revealed: false }`, the feed held
  no outcome line. After the jumper revealed ("Sale un 4 · Al cemento") it
  still held none. Only on *continue* did `magaluf.log.cemento` appear — with
  the table already moved to `index: 1`, whose outcome was still unwritten.

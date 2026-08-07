# Magaluf — Game Design

A push-your-luck game about surviving a weekend as a party tourist in
Mallorca. 3–6 players, roughly 25 minutes.

This document is the design, not a specification. Every number in it has been
run through the simulator in `src/sim.ts`; where a number was chosen against
evidence rather than intuition, the evidence is stated. It is the intended
source for `spec/features/032-magaluf-rules/spec.md` once the design settles.

> **Content note.** Balconing — falling or jumping from a hotel balcony while
> drunk — kills real tourists in Mallorca most summers. The game is a black
> comedy about it. That is deliberate, and worth a one-line note wherever the
> game is listed.

---

## 1. Structure

A weekend is **3 rounds**: Viernes/Friday, Sábado/Saturday, Domingo/Sunday.
Each round has **3 phases**: **Tardeo** (day drinking) → **Noche** (clubbing)
→ **After** (afterparty).

Withdrawal is per phase. Sitting out the Noche does not stop you rejoining
for the After. Intoxication and unbanked VP accumulate across all three
phases of a day.

## 2. The turn

Round-robin among players still partying in the current phase. On your turn:

| Action | Effect |
|---|---|
| **Beber** / Drink | Draw 1 Alcohol card → gain its Intoxication and VP → draw 1 Event card and resolve it |
| **Retirarse** / Withdraw | Out for this phase. Aguafiestas penalty applies if you drank too little |

Using an item is a **free action**, maximum one per turn, and can be combined
with either choice. Two items are exceptions and are described in §8.

A player who reaches the phase's drink cap is auto-withdrawn ("closing
time"). The phase ends when every player has withdrawn. The starting player
rotates each phase.

Drinks a player did not choose — a Ronda, a Chupito de la casa — still count
toward their phase drink total. If somebody buys you a shot, you drank it.

## 3. Information

Almost everything is public: intoxication, VP, items, Resaca, drink counts.
**The only hidden information in the game is the day's face-down limit card**,
which makes Red Bull (peek at the limit) the single source of private
knowledge and the reason to hold one.

This matters for the port: `playerView` needs to filter exactly one field
plus one per-player boolean.

## 4. Scoring and the Resaca

VP earned during a round is **unbanked**. It banks permanently only if you
survive that night. At the end of each round, if your Intoxication exceeds
the day's Drinking Limit, you go up to the balcony (§5).

Everything banked is multiplied by the **day's rate**:

| Day | VP multiplier |
|---|---|
| Viernes | ×1 |
| Sábado | ×1.5 |
| Domingo | ×2.25 |

> **Why the multiplier exists.** Without it the weekend has no arc. The
> simulator showed a *flat* death curve: shrinking the limit does not make
> later days more dangerous, because a rational player simply drinks less to
> match. Danger has to come from temptation rather than from the dealer, so
> the last night has to be worth enough that players choose to overreach. It
> also stopped Friday's banked VP from dominating the final score, which had
> the leader entering Sunday's After winning 78% of games; it is 61% now.

Intoxication resets each morning — but **not to zero**. You start each day at
your accumulated **Resaca**.

| Source | Resaca gained |
|---|---|
| Vomitona / Puke (−4 Intoxication now) | +3 |
| Ambulancia / Ambulance (−5 Intoxication now) | +4 |
| Surviving a balconing jump | +4 |
| Farlopa / Cocaine | +3 |

Resaca stacks and is never cleared. Every relief mechanic in the game is
therefore a trade across days: save yourself tonight, doom yourself on
Sunday. It is also the only thing besides the day multiplier that makes later
days genuinely harder, since it removes capacity a player cannot drink their
way around.

Keeping the cost in Intoxication rather than as a modifier on the Limit is
deliberate: one currency, moving in one direction, displayed on the counter
players already watch.

## 5. Balconing

Exceeding the limit is not instant death. Let **`d` = Intoxication − Limit**
(so `d ≥ 1`).

```
P(pool) = clamp01( 0.70 − (d − 1) × 0.12 )
```

| `d` | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Survival | 70% | 58% | 46% | 34% | 22% | 10% | 0% |

**Either way you lose the entire round's unbanked VP and all your items.**
You are in a swimming pool with a fractured pelvis; the night is over.

- **Piscina / Pool** — you live. Bank a **Leyenda de Magaluf** bonus of
  `3 + d` VP, take **Resaca 4**, and continue the weekend.
- **Cemento / Concrete** — dead, out for the rest of the weekend. VP banked
  on nights you already survived stays yours.

**Jumping is never worth planning for.** The legend bonus grows with `d` but
survival falls faster, so expected value peaks at **2.90 VP (at d = 2)**
against a median round pool of **40 VP**. There is no `d` at which a player
should aim to go over. The simulator asserts this every run rather than
trusting the arithmetic.

## 6. The Drinking Limit

One card per day, shared by all players, drawn face-down and revealed at the
**start of the After**.

| Day | Limit deck |
|---|---|
| Viernes | 26 / 27 / 28 / 29 |
| Sábado | 20 / 23 / 26 / 29 |
| Domingo | 14 / 18 / 22 / 26 |

> **Note the widening spread rather than a falling level.** The simulator was
> unambiguous: lowering the limit does almost nothing to the death rate,
> because players scale their drinking to whatever capacity they have.
> Dropping Sunday's whole deck by 7 points moved the Sunday death rate by
> under two points. What actually kills people is being *wrong* about the
> number while it is still face-down. Friday's deck is tight and predictable;
> Sunday's is wide, so a player estimating 20 may be facing 14 and not find
> out until the After.

Reveal timing is a config value (`tardeo` / `noche` / `after` / `never`), not
a hardcoded branch, and is exposed in the prototype's tuning panel.

## 7. Alcohol cards

| Card (ES / EN) | Int | VP | Tardeo | Noche | After |
|---|---|---|---|---|---|
| Caña / Small beer | 1 | 1 | 6 | 2 | — |
| Tinto de verano | 1 | 1 | 5 | — | — |
| Clara / Shandy | 1 | 1 | 3 | — | — |
| Pinta / Pint | 2 | 2 | 4 | 2 | — |
| Copa de vino / Wine | 2 | 2 | 4 | 2 | — |
| Vermut | 2 | 2 | 3 | — | — |
| Jarra de sangría | 2 | 3 | 3 | — | — |
| Mojito | 2 | 2 | 2 | 3 | — |
| Cubata / Rum & coke | 3 | 3 | 2 | 7 | 3 |
| Chupito / Shot | 3 | 2 | 1 | 4 | 3 |
| Gin-tonic | 3 | 3 | — | 5 | — |
| Cóctel de la casa | 3 | 4 | — | 3 | — |
| Jägerbomb | 4 | 4 | — | 3 | 4 |
| Copa cargada / Heavy pour | 4 | 4 | — | 2 | 3 |
| Chupito de hierbas | 4 | 6 | — | — | 3 |
| Tequila x3 | 5 | 7 | — | — | 4 |
| Absenta / Absinthe | 5 | 8 | — | — | 3 |
| Garrafón / Bootleg spirits | 5 | 6 | — | — | 2 |
| Pecera / Fishbowl | 6 | 10 | — | — | 2 |
| Agua / Water | −1 | 0 | 1 | 1 | 1 |
| **Deck size** | | | **34** | **34** | **28** |
| **Mean Intoxication** | | | **1.59** | **2.71** | **4.07** |

> **The five After-exclusive spirits carry a deliberately better VP rate.**
> In the first tuned build the Tardeo was the *most* VP-efficient phase in the
> game (1.52 VP per point of intoxication, against the After's 1.28), so there
> was no economic reason to ever walk into the dangerous phase. Two things
> caused it: the After's spirits were priced at roughly the same rate as
> everything else, and events pay out per *draw* rather than per point — and
> because Tardeo drinks are cheap you get far more draws per point of
> capacity. Both were fixed. The phases now run **1.34 / 1.27 / 1.58**.

The single **Agua** in each deck is deliberate: drawing is never *certainly*
fatal, which keeps the post-reveal scramble alive.

## 8. Phases, caps and exit rules

| Phase | Max drinks | Min drinks before exit | Aguafiestas penalty | Último en Pie |
|---|---|---|---|---|
| Tardeo | 4 | 2 | −2 VP | +2 VP |
| Noche | 5 | 3 | −4 VP | +3 VP |
| After | 4 | 1 | −5 VP | +5 VP |

**Último en Pie** goes to the last player out, and also requires meeting the
drink minimum — otherwise you could hold two joints and idle your way to the
bonus without drinking anything.

The After's minimum is 1 so "show up, have one, go to bed" stays a legitimate
cautious play on Sunday.

## 9. Items

| Item | Effect | Legal? |
|---|---|---|
| Kebab | −3 Intoxication | ✔ |
| Botella de agua / Water bottle | −2 Intoxication | ✔ |
| Red Bull | Peek at the Drinking Limit | ✔ |
| Porro / Joint | **Skip your draw this turn without withdrawing** — watch what everyone else does, decide next turn | ✘ |
| Pastis / MDMA | Double your next drink's VP, +2 Intoxication | ✘ |
| Farlopa / Cocaine | **Immediately take another turn; that drink's Intoxication is halved (round down). Gain Resaca 3** | ✘ |

The joint and the farlopa are mirror images: one buys a turn of hesitation,
the other spends a turn you did not have. Both end up in the same pocket the
police are interested in.

**Farlopa is structurally a last-night card, and the game teaches this
without a rule saying so.** Its Resaca is a deferred version of the
intoxication it just saved you: play it on Friday and you pay twice, on
Saturday and Sunday; play it on Sunday and you never pay at all, because
there is no Monday.

> This is the design claim the simulator was best placed to falsify, so the
> bots were written to reason about it generically — they weigh Resaca against
> days remaining and have no idea what day it is. **Farlopa gets played 3.78×
> as often on Sunday as on Friday.** The gradient teaches itself.

## 10. The police

Split into a common nuisance and a rare wildcard. **Both only reach players
who are still partying.** A player who has gone home is not raided — which
also closes a loophole where you could hold contraband, withdraw early, and
hope a Redada banked your VP and cancelled your limit check for free.

**Cacheo / Stop-and-search** (1 per phase deck). Every player holding
contraband discards it and loses 3 VP.

**Redada / Police Raid** (1 in Noche, 2 in After). Every player holding
contraband is **arrested**. If nobody is holding, nothing happens. Arrested
players:

- **Bank the round's VP so far, immediately and permanently**, at the day's rate.
- Are out for all remaining phases of that day.
- Are **not** charged the Aguafiestas penalty — they did not choose to leave.
- Face **no limit check that night**. You sober up in a cell.
- Are released and play normally the next day.

Its value is never fixed. Early in a strong Friday it wrecks you. On Sunday's
After, six over the limit and staring at a 10% survival roll, being arrested
is salvation. Crucially that lifeline is *earned by carrying contraband*
rather than granted for being drunk, which gives the illegal items a hidden
upside playing against the Cacheo's steady punishment.

> The Redada whiffing when nobody is holding was the risk here, and it was
> real: at first pass it did nothing **78%** of the time. Raising contraband
> supply (Camello now appears 5/7/8 times per deck) and cutting the cards that
> strip items brought it to **33.6%**.

## 11. Events

Drawn after every drink from a phase-tiered deck. Tardeo events are mild,
Noche events interactive, After events savage with heavy forced consumption.

| Event (ES / EN) | Effect | Tardeo | Noche | After |
|---|---|---|---|---|
| Ligue / Hook-up | +3 VP | 2 | 2 | — |
| Ligue de la noche | +5 VP | — | 2 | 4 |
| Fiesta de la espuma / Foam party | +2 VP to everyone still in | 1 | 2 | — |
| Karaoke | +2 VP, or +4 if you are the most intoxicated | 1 | 2 | 3 |
| Foto para el Insta | +2 VP | 2 | 2 | — |
| Barra libre / Open bar | +1 VP per drink this phase | 1 | 2 | 2 |
| Rey del guiri | +3 VP to whoever drank most this phase | — | 2 | 3 |
| "Solo voy a mirar" | +5 VP | — | — | 4 |
| Se te cae el móvil al mar | −3 VP | 2 | 2 | 2 |
| Te roban la cartera / Pickpocketed | Lose all items | 1 | 1 | 1 |
| Te pierdes / You get lost | Skip your next turn, stay in | 2 | 2 | 1 |
| Chupito de la casa / House shot | Draw another Alcohol card | 2 | 3 | 5 |
| Ronda / Round of drinks | Everyone still in drinks an Alcohol card | 2 | 3 | 5 |
| Te dan garrafón | +3 Intoxication | — | 2 | 4 |
| Pelea / Fight | +4 VP and +2 Intoxication | 1 | 2 | 3 |
| Vomitona / Puke | −4 Intoxication, Resaca +3 | 1 | 2 | 2 |
| Ambulancia | Most drunk withdraws, −5 Intoxication, Resaca +4 | — | 1 | 2 |
| Kebab / Botellín / Red Bull | Gain that item | 2/2/2 | 2/1/— | 1/—/— |
| Camello / Dealer | Gain a contraband item | 5 | 7 | 8 |
| Cacheo / Stop-and-search | See §10 | 1 | 1 | 1 |
| Redada / Police raid | See §10 | — | 1 | 2 |
| No pasa nada / Nothing happens | — | 4 | 1 | — |

## 12. Winning

Most banked VP after Sunday. Dead players score what they banked on nights
they survived. Tiebreak: highest total Intoxication survived across the
weekend — the most hardcore survivor wins.

---

## 13. Where the balance landed

20,000 games, 4 players, one bot policy per seat. Full report from
`npm run sim`.

| Measure | Result |
|---|---|
| Death rate Fri / Sat / Sun | **8.1% / 11.7% / 18.3%** of players still alive that morning |
| Players dead by Monday | **33.5%** |
| Games with at least one death | **85.7%** |
| Total wipeouts | 0.7% |
| Jumps per game | 2.55, of which **52.6% are fatal** |
| Distribution of `d` | 28% at 1, 23% at 2, 17% at 3, tail to 10 |
| Win rate: cautious / balanced / greedy / reckless | 31.4% / 36.3% / 27.2% / 5.0% |
| Median winning score | 139 VP |
| Sunday-After leader goes on to win | 60.3% |
| Farlopa played Sunday vs Friday | 3.71× |
| Redada does nothing | 33.4% |
| Aguafiestas penalty rate | 21.7% of exits |
| Median game length | 95 player-turns |

**15 of 15 balance targets met at 4 players.**

### There is a skill ceiling, and it is not at the limit

Sweeping the risk threshold — the fraction of estimated capacity a player will
project themselves to before leaving — gives a clear optimum and a cliff:

| Threshold | 0.92 | 0.95 | 0.98 |
|---|---|---|---|
| Win rate | 29.2% | 27.2% | 22.8% |

A player aiming squarely **at** the limit wins 22.8% of 4-player games, which
is *below the 25% random baseline*. Aiming at ~0.90 of it wins comfortably
above. The margin is small enough that it is not obvious and large enough that
it decides games, which is the shape you want: the skill is sizing a buffer
against the variance still to come, and the variance is much larger in the
After than in the Tardeo. This is why the game rewards knowing the decks.

### The targets that changed, and why

The original plan asked for a Saturday death rate of 20–30% and a Sunday rate
of 40–55%. Those numbers were set before the simulator existed, and they were
wrong — not merely unmet.

Three separate experiments (lowering the limit level, widening its spread,
and tripling the After's forced-consumption events) all produced the same
result: **a rational player's death rate is roughly constant no matter what
you do to their capacity**, because they scale their drinking to it. Getting
to 40–55% would require players to be unable to avoid dying, which would mean
their decisions did not matter — the opposite of push-your-luck design.

What is worth demanding instead is the **shape**: danger that strictly rises
across the weekend, and a weekend lethal enough to earn the theme. Both hold.
The revised targets are in `checks()` in `src/sim.ts` alongside the reasoning.

### Player count

The design needs **4+ players**, and 2-player does not work.

| Players | Dead by Monday | Targets met |
|---|---|---|
| 2 | 11.1% | 7/15 |
| 3 | 21.9% | 10/15 |
| 4 | 35.7% | 15/15 |
| 5 | 30.9% | 13/15 |
| 6 | 30.2% | 12/15 |

The cause is structural rather than a tuning miss: forced-consumption events
(**Ronda** above all) hit *everyone still partying*, so the unavoidable
intoxication a player absorbs scales with how many other people are at the
table. A 2-player game has almost none of it, and every drink becomes a
choice the player can simply decline. Dropping the whole limit deck by 7
points at 2 players still only reached 15.7%.

**Recommendation:** `minPlayers: 3`, `maxPlayers: 6`, sweet spot 4–5. If
2-player is wanted later it needs a design answer, not a number — the
obvious candidate is a non-player "guiri" seat that draws cards and triggers
Rondas, though `tech-stack.md` notes boardgame.io has no first-class
non-player actor and it would have to be modelled as a regular seat.

---

## 14. Deliberate simplifications in the prototype

- **Camello hands over a random contraband item** rather than letting the
  player choose. A choice needs a pending-decision stage, which is real
  machinery for a modest balance effect. Worth revisiting in the real module,
  where boardgame.io stages make it cheap.
- **No bots ship in the game.** The policies in `src/bots.ts` exist only to
  drive the simulator.
- **The jump modal shows the odds and then the outcome**, but the engine has
  already rolled by then. In the real module the roll should be a distinct
  step so the reveal is genuinely live.

## 15. Notes for the port

The engine was written against boardgame.io's constraints so the move to
`packages/game-core/src/games/magaluf/` is mechanical:

- State is plain JSON throughout — no `Map`, `Set` or class instances.
- All randomness goes through the `Random` interface in `src/rng.ts`,
  including the balconing roll, with the generator's position stored in state.
  Porting is swapping that one file for boardgame.io's `random` plugin.
- Moves mutate and return state, which is exactly what an immer draft wants.
- Hidden state is one field plus one per-player boolean.
- Every card carries `es` and `en` names and the engine never reads them, so
  extracting `magaluf.*` keys into `en.json` / `es.json` is mechanical and
  `localeParity.test.ts` will enforce parity.
- `config.ts` becomes the module's constants plus its `settingsSchema`.

Per `tech-stack.md`'s versioning heuristic this is a new catalog entry,
`magaluf-v1` — the turn structure and win condition are not a superset of
anything already in the catalog.

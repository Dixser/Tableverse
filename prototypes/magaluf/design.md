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

> **Everything here is physically playable.** Every probability in the game is
> either a count of cards in a deck or a roll of one d6. There are no
> percentages to look up and nothing that needs a computer to adjudicate —
> the digital version is an implementation of a tabletop game, not the other
> way round.

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
| **Beber** / Drink | Turn over 1 Alcohol card and gain its Intoxication and VP. The Event card is drawn but stays **face-down** |
| **Revelar evento** / Reveal event | Turn the Event over and read it to the table. Ends the turn |
| **Retirarse** / Withdraw | Out for this phase. Aguafiestas penalty applies if you drank too little |

**Drinking is deliberately two steps, because at a table it is two decks.**
You flip the drink, everybody updates their numbers, and only then does
somebody turn the event over and read it out. Doing both in one action asked
players to absorb two cards at once and hold the arithmetic in their heads.
While an event is face-down its drawer may do nothing else, and nobody else
may turn it over.

This changes nothing about *what* is drawn or in what order, so it has no
balance effect and the simulator was deliberately not changed for it — only
where the game pauses.

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

Exceeding the limit is not instant death. Let **`d` = Intoxication − Limit`**
(so `d ≥ 1`).

> **Roll a d6. You survive if you roll higher than `d`.**

That is the whole rule. Everything is playable with cardboard and one die —
there is no probability anywhere in this game that a table cannot produce.

| `d` | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|
| Survival | 5/6 = 83% | 4/6 = 67% | 3/6 = 50% | 2/6 = 33% | 1/6 = 17% | 0% |

> **This replaced a continuous formula, and lost nothing.** The earlier design
> read `clamp01(0.70 − (d − 1) × 0.12)`, giving 70/58/46/34/22/10%. Those are
> not numbers a die can make. But `base − (d − 1) × decay` with
> `base = (N−1)/N` and `decay = 1/N` collapses to exactly `(N − d)/N` — the
> chance of rolling above `d` on a dN. The curve was always die-shaped; it was
> just carrying two invented constants instead of naming the object that
> produces it. Swapping them for a d6 changed the simulated outcome by about
> three points and removed two free parameters, two unbounded inputs from the
> settings form, and the last unphysical rule in the game.

**Which die is the difficulty setting.** A dN survives at `(N − d)/N` and
becomes impossible at `d = N`, so the die alone sets both the base chance and
how fast it collapses:

| Die | Over-limit deaths | Dead by Monday | Targets met |
|---|---|---|---|
| d4 | 64.0% | 40.5% | 13/15 — Friday gets too lethal |
| **d6 (default)** | **48.9%** | **33.4%** | **15/15** |
| d8 | 38.4% | 27.5% | 12/15 |
| d10+ | ≤31% | ≤23% | stops earning the theme |

**The roll is the entire penalty.** Losing the night is what dying costs, not
what jumping costs.

- **Piscina / Pool** — you live, and the night lives with you: bank the round
  pool at the day's multiplier exactly as anyone under the limit would, keep
  your items, and take a **Leyenda de Magaluf** bonus of `3 + d` VP on top,
  plus **Resaca 4**.
- **Cemento / Concrete** — dead, out for the rest of the weekend. The round's
  unbanked VP and every item go with you. VP banked on nights you already
  survived stays yours.

**What the jumper is risking is the pool, not the bonus.** The Leyenda bonus
still peaks at **3.33 VP** at `d = 2`, far below a median round pool of **41
VP**, so it never justifies going over on its own. The real sum is
`(N − d)/N × pool` against a certain `pool` for stopping under the limit —
83% of the night at `d = 1`, half of it by `d = 3`.

> **This replaced a forfeit on both outcomes**, which was inherited from the
> era when going over simply killed you. Measured over 20,000 games at 4
> players, the lethality is untouched (33.2% dead by Monday against 33.4%,
> phase economy identical to three decimals) but the reward curve is not:
> median winning score 133 → **151**, and win rates move from cautious 33.6% /
> balanced 35.0% / greedy 26.3% / reckless 5.0% to **19.4 / 36.1 / 31.2 /
> 13.3**. That fails the greedy-share target at 61.6% (band 40–60%) — the one
> target this rule costs. The bots do not adapt their thresholds, so the true
> shift is smaller than it reads; playtesting decides whether it needs paying
> back, and `balconyDie` is the obvious dial if it does.

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
| Pastis / MDMA | Double your next drink's VP | ✘ |
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

Drawn after every drink. **The event decks are tiered by phase the same way
the alcohol decks are** — each phase has its own cards, not just different
quantities of shared ones.

> **Why the tiering exists.** One `ligue` card worth +3 VP appearing in all
> three decks meant a Tardeo draw and an After draw paid the same. Since
> Tardeo drinks are cheap, a player got far more draws per point of capacity
> there — which is half of why the Tardeo was once the most VP-efficient phase
> in the game. Tiering the events was the other half of that fix, and it is
> what finally made the phase economy **monotonic**: 1.20 → 1.24 → 1.53. Under
> the previous build the Noche was a dip, slightly *worse* value than day
> drinking.

Five families run across all three tiers, escalating in both reward and cost:

| Family | Tardeo | Noche | After |
|---|---|---|---|
| **Ligue** / Hook-up | Ligue de piscina, +2 VP | Ligue en la pista, +4 VP | Ligue del after, +6 VP |
| **Fiesta** (everyone still in) | Chiringuito, +1 VP | Fiesta de la espuma, +2 VP | Amanecer en la playa, +3 VP |
| **Pelea** / Fight | Piques de guiris, +2 VP +1 Int | Pelea, +4 VP +2 Int | Pelea con los porteros, +6 VP +3 Int |
| **Chungo** (it goes wrong) | Móvil al mar, −2 VP | Te roban la cartera, lose all items | Despiertas sin nada, lose all items and −4 VP |
| **Castigo** (it goes badly wrong) | Insolación, +2 Int | El portero te saca, thrown out of the phase | Coma etílico, +5 Int |

Phase-exclusive singles:

| Event | Effect | Deck |
|---|---|---|
| Foto para el Insta | +2 VP | Tardeo |
| Te dan garrafón | +3 Intoxication | Noche, After |
| "Solo voy a mirar" | +6 VP | After |
| **La terraza del quinto** | **+8 VP and +3 Intoxication** | After |

**La terraza del quinto** is the single most tempting card in the game and
the only one that pays 8. It is also, of course, a balcony.

Shared across tiers at different frequencies:

| Event | Effect | Tardeo | Noche | After |
|---|---|---|---|---|
| Karaoke | +2 VP, doubled if you are the most intoxicated | — | 2 | 2 |
| Barra libre / Open bar | +1 VP per drink this phase | — | 2 | 2 |
| Rey del guiri | +3 VP to whoever drank most this phase | — | 2 | 3 |
| Te pierdes / You get lost | Skip your next turn, stay in | 2 | 2 | 1 |
| Chupito de la casa | Draw another Alcohol card | 2 | 3 | 5 |
| Ronda / Round of drinks | Everyone still in drinks an Alcohol card | 2 | 3 | 5 |
| Vomitona / Puke | −4 Intoxication, Resaca +3 | 1 | 2 | 2 |
| Ambulancia | Most drunk withdraws, −5 Int, Resaca +4 | — | 1 | 2 |
| Kebab / Botellín / Red Bull | Gain that item | 2/2/2 | 2/1/— | 1/—/— |
| Camello / Dealer | Gain a contraband item | 5 | 7 | 8 |
| Cacheo / Stop-and-search | See §10 | 1 | 1 | 1 |
| Redada / Police raid | See §10 | — | 1 | 2 |
| No pasa nada / Nothing happens | — | 4 | 1 | — |
| **Deck size** | | **34** | **42** | **50** |

The After deck contains no **No pasa nada**. Nothing in the After is ever
nothing.

Event effect magnitudes live on the cards in `cards.ts`, next to the alcohol
values, rather than in `config.ts`. Keeping a card's numbers on the card is
what stops the effect and the flavour text drifting apart — which had already
happened once, with Vomitona's text still promising Resaca 2 after it was
tuned to 3. `config.ts` now owns deck *compositions* only.

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
| Death rate Fri / Sat / Sun | **7.9% / 11.7% / 18.4%** of players still alive that morning |
| Players dead by Monday | **33.2%** |
| Games with at least one death | **84.4%** |
| Total wipeouts | 0.6% |
| Jumps per game | 2.72, of which **48.8% are fatal** |
| Distribution of `d` | 27% at 1, 22% at 2, 17% at 3, tail to 10 |
| Phase economy (VP per point of intoxication) | **1.19 / 1.24 / 1.56** — strictly rising |
| Win rate: cautious / balanced / greedy / reckless | 19.4% / 36.1% / 31.2% / 13.3% |
| Median winning score | 151 VP |
| Sunday-After leader goes on to win | 57.1% |
| Farlopa played Sunday vs Friday | 4.25× |
| Redada does nothing | 34.6% |
| Aguafiestas penalty rate | 22.6% of exits |
| Median game length | 93 player-turns |

**14 of 15 balance targets met at 4 players.** The miss is the greedy share of
greedy-plus-cautious wins, at 61.6% against a 40–60% band — the price of the
survivor keeping their night (§5). Every other target holds, including the
three the theme depends on: rising danger, a lethal weekend, and a phase
economy that pays for the danger it sells.

### There is a skill ceiling, and it is not at the limit

> Measured under the old rule, where both jump outcomes forfeited the round.
> The shape of the claim survives the change — a buffer still beats precision,
> because the pool is still what is at stake — but the exact figures below have
> not been re-swept, and the optimum should now sit slightly closer to the
> limit than 0.90.

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

| Players | Dead by Monday | Median turns | Targets met |
|---|---|---|---|
| 2 | 11.1% | 54 | 7/15 |
| 3 | 21.9% | 75 | 10/15 |
| 4 | 35.8% | 92 | 15/15 |
| 5 | 30.9% | 112 | 13/15 |
| 6 | 30.5% | 132 | 12/15 |

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

- **The Camello does not let the player choose** which contraband they get.
  A choice needs a pending-decision stage, which is real machinery for a
  modest balance effect. Worth revisiting in the real module, where
  boardgame.io stages make it cheap.

  It is no longer *random*, though: there are three separate dealer cards
  (`camelloPorro`, `camelloPastis`, `camelloFarlopa`) and the odds are their
  counts in the deck, like everything else. That also bought something the
  old single card could not express — the mix shifts across the weekend, from
  mostly joints in the Tardeo to mostly powder in the After, which is where
  Farlopa wants to be anyway.
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

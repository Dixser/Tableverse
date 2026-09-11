# Feature 043 — Magaluf: el Duelo

## Description

A new event card that turns one player's draw into a drinking contest between
two. The drawer may challenge any other seat still in the venue; the two then
take turns either drinking another card or backing down, and whoever holds out
takes a pot that grows with every drink poured.

Every other card in the deck resolves on the drawer's own decision. This is the
first where **a seat that is not the turn seat has to act**, which is the case
feature 034 deferred: "a choice belonging to a seat other than the drawer […]
needs a boardgame.io stage with `activePlayers`". The duel is that, done once
and done properly.

Lands as a change to `magaluf-v1`, on the same argument as 034: no recorded
match exists to corrupt.

### Depends on 042

The pot is priced like Barra libre — 1 / 2 / 3 VP across the venues — and those
three tiers (`barraLibreTardeo` / `Noche` / `After`) exist only in feature 042's
working tree; on `main`, `barraLibre` is still one flat card. The duel does not
need that code, since each Duelo printing carries its own rate, but the deck
counts below are measured against 042's decks (042 already traded the Tardeo's
second Ronda for Barra libre). Branch from 042 once it is committed.

## The card

Three printings, one per venue, following Barra libre's convention exactly:
`vp` on the card is a **rate**, not a total.

| Card | Venue | Rate | Copies |
|---|---|---|---|
| `dueloTardeo` | Tardeo | 1 | 1 |
| `dueloNoche` | Noche | 2 | 2 |
| `dueloAfter` | After | 3 | 2 |

Two options, the active branch first and the pass last, as every existing
choice card orders them:

| Option | Effect |
|---|---|
| `retar` | Pick an opponent and start a duel. New structural flag `duels: true`. |
| `dejarlo` | Nothing happens. **Reused** from the three Camello cards — its label is already "Leave it — nothing happens". |

`aguantar` is deliberately *not* reused for anything here: its label carries
Vomitona's effect ("Hold it in — +2 Intoxication").

**Fewer than two seats partying:** the card has no effect. Checked at reveal,
before the choice is parked — the drawer is never offered a challenge nobody
can accept. Logged and pinned to the card as `duelNobody`, so the table reads a
rule rather than a card that silently did nothing.

## The duel

### Flow

The existing chain, two links longer:

    drink → pendingEvent → revealEvent → pendingChoice → chooseEventOption(retar)
          → pendingDuel (no target) → chooseDuelTarget
          → [duel phase] duelDrink / duelFold … → settle → party | confirm | balcony

1. **Target.** The drawer picks any other seat whose status is `partying`.
   Withdrawn, arrested and dead seats cannot be picked. This step stays in the
   `party` phase: the drawer is still the turn seat, so it is an ordinary move
   gated like `chooseEventOption`.
2. **Exchange.** The **target answers first**: drink or back down. If they
   drink, the challenger faces the same choice; and so on, alternating, until
   somebody backs down.
3. **Payout.** Whoever did *not* back down gains the pot.

### The pot

    pot = rate × (d + 1)          d = drinks poured in this duel, both sides

The pot opens at the base and every drink adds another base, so each drink
raises the stakes — including the first. A target who backs down at once hands
the challenger exactly the base.

| d | 0 | 1 | 2 | 3 | 4 | 6 | 8 |
|---|---|---|---|---|---|---|---|
| Tardeo | 1 | 2 | 3 | 4 | 5 | 7 | 9 |
| Noche | 2 | 4 | 6 | 8 | 10 | 14 | 18 |
| After | 3 | 6 | 9 | 12 | 15 | 21 | 27 |

Paid through `gainVP`, into the **round pool**, not the bank: earned tonight,
so it rides on tonight's limit check like Barra libre and Cierrabares. Logged
and pinned to the card as `duelResult` with `n` (drinks) and `vp`.

Backing down is never free. Whoever backs down is the one who *creates* the
other player's payout — there is no position in the exchange where both can
stop and nobody is paid.

### A duel drink

`drawAlcohol` + `pourDrink` — the pair `extraDrink`, Ronda and Chupito de la
casa already use — and **never draws an event**, for the reason
`applyCardEffects` records: an event that draws an event chains without a fixed
point.

Consequences that fall out of reusing the ordinary path, all intended:

- It counts toward `drinksThisPhase` and `totalDrinks`, and so toward
  **Cierrabares**. A duel is now the biggest lever on the bar-closing race;
  accepted.
- It lands face-up next to the Duelo card in `lastDraw.pours`, so the table
  sees every drink of the duel as a compact `CardTile`.
- An Agua can come up. It still counts as a drink and still raises the pot.
- An **empty alcohol deck reshuffles its discard** and the duel carries on.
  This is `refill`'s existing rule, logged as `reshuffledAlcohol`, and it cannot
  fail: `drawAlcohol` moves every card it draws straight to the discard, so deck
  and discard together always hold the whole venue's alcohol. A long After duel
  is the likeliest thing in the game to trigger one.
- Nobody jumps mid-duel. The limit is checked at night, as for every other drink.

### Drink cap

Duelists **may drink past `maxDrinks`** during the duel. When it ends, every
seat at or over the cap is sent home (`closingTime`), exactly as `finishTurn`
would have done at the end of the turn.

The sweep runs **at duel end**, not at turn end, and the two differ: a duel
that came off a Farlopa's extra draw does not end the turn. So the sweep is
extracted from `finishTurn` into a helper both call.

Order matters because `withdrawSeq` decides who opens the next venue
(`openerAfterLastOut`). `finishTurn` sweeps in `activeSeatIDs` order, which
would let seat number decide it when both duelists blow the cap — the
positional tiebreak Rey del guiri and Karaoke were both reworked to remove. So
seats are sent home **in the order they reached the cap**. A duelist already at
it when the duel opened counts first; this is common, since the drawer's last
permitted drink is exactly the one that can turn up a Duelo.

Written so that it does not depend on the cap existing. A future host setting
that removes `maxDrinks` leaves the sweep with nothing to do.

### Items

**No items during a duel.** `useItem` is a `party` move and the duel runs in its
own phase, so this holds structurally rather than by a check.

## Turn machinery

### Why a phase

`canAct` requires `G.turnSeatID === playerID`, and the `party` phase declares
only a turn order — boardgame.io rejects a move from any other seat before
`canAct` is even consulted. The target cannot act there.

The precedent is `balcony`: a dedicated phase with `activePlayers: ALL`, each
move server-gated to the one seat whose moment it is. The duel copies it.

    duel: {
      turn: { activePlayers: ActivePlayers.ALL },
      moves: { duelDrink, duelFold, abandonDuel },
    }

No `next`: every exit is explicit, like the other two.

It is safe to leave `party` mid-turn and come back because `turnOrder.first`
reads `G.turnSeatID` rather than framework state. Re-entering `party` resumes
the same seat.

### State

    interface PendingDuel {
      challengerID: string;
      /** null while the challenger is still choosing. */
      targetID: string | null;
      /** Whose decision it is. The target answers first. */
      toActID: string | null;
      eventId: 'dueloTardeo' | 'dueloNoche' | 'dueloAfter';
      /** Drinks poured in this duel, both sides. */
      drinks: number;
      /** Seats that reached maxDrinks, in the order they did. */
      overCap: string[];
      /** Carried through from the PendingChoice that produced it. */
      endsTurn: boolean;
    }

`G.pendingDuel: PendingDuel | null`, and `canAct` refuses every `party` move
while it is set — the same sentence it already says for the other two.

`chooseEventOption` parks the duel rather than settling when the picked branch
carries `duels`, mirroring how `revealEvent` already declines to settle while a
choice is owed.

### Settling

When the duel ends — a fold, or `abandonDuel`:

1. Pay the pot (not on `abandonDuel`; see open question 2).
2. Send `overCap` home, in order.
3. Clear `G.pendingDuel`.
4. Hand over exactly as `settleAfterEvent` would have: if `endsTurn`, or the
   drawer is at the cap, or the drawer is no longer partying, run `finishTurn`
   and map its result to a phase — `'turn'` → `setPhase('party')`, `'confirm'`,
   `'balcony'` as named, `'finished'` → nothing. Otherwise return to `party`
   with the drawer's action still owed.

`handOver` cannot be reused unchanged: it maps `'turn'` to `endTurn()`, which is
wrong from inside the duel phase.

## Board

Two new surfaces. Both replace the `ActionBar`, for the reason
`EventChoicePanel` gives: while a decision is owed there is exactly one thing
to do.

- **Opponent picker** (`party`, while `targetID === null`). The drawer gets one
  button per eligible seat; everyone else gets "{{name}} is choosing an
  opponent…".
- **Duel panel** (`duel` phase, every seat). Challenger vs target, drinks so
  far, the **current pot and what the next drink raises it to** — the rising
  stake is the whole card, so it is on screen. The seat that owes the decision
  gets Drink / Back down; the other duelist and the table get a waiting line.
  The host additionally gets the abandon control.

A duelist sent home at duel end is being ejected outside their own turn, which
happens nowhere else in the game. The `closingTime` log line already names
them; the panel must not simply vanish from under a player who is watching.

## Content

Written Spanish first, as 042 set down. Titles and flavour below are **drafts**
for the author's voice.

| Key | es | en |
|---|---|---|
| `event.dueloTardeo.title` | Duelo en el chiringuito | Beach bar duel |
| `event.dueloNoche.title` | Duelo en la barra | Duel at the bar |
| `event.dueloAfter.title` | Duelo al amanecer | Duel at dawn |
| `event.duelo*.effect` | Elige: retar a alguien a un duelo de copas, o dejarlo. Quien aguante se lleva <vp>{{vp}} PV</vp>, más <vp>{{vp}} PV</vp> por cada copa del duelo. | Choose: challenge someone to a drinking duel, or leave it. Whoever holds out takes <vp>{{vp}} VP</vp>, plus <vp>{{vp}} VP</vp> for every drink in the duel. |
| `eventOption.retar` | Retar — eliges a quién | Challenge — pick an opponent |

Flavour — one line for the Tardeo, two each for the Noche and After:

- **Tardeo 0** — *El primero que pida agua paga la ronda.* / *First one to order water buys the round.*
- **Noche 0** — *Nadie se acuerda de por qué empezó. Nadie va a ceder.* / *Nobody remembers how it started. Nobody's backing down.*
- **Noche 1** — *El camarero ya ha dejado de preguntar.* / *The barman has stopped asking.*
- **After 0** — *Sale el sol, y solo uno de los dos lo va a ver.* / *The sun's coming up, and only one of you is going to see it.*
- **After 1** — *A diez pasos. Con vasos.* / *Ten paces. With glasses.*

New keys besides the cards:

- `magaluf.log.*` — `duelChallenge` {actor, target}, `duelFold` {actor, n},
  `duelResult` {actor, n, vp}, `duelNobody`, `duelAbandoned` {actor}. Duel
  drinks reuse `drank`.
- `magaluf.board.*` — `duelPickTarget`, `duelWaitingTarget` {name}, `duelVs`
  {challenger, target}, `duelPot` {vp}, `duelNextPot` {vp}, `duelDrink`,
  `duelFold`, `duelWaiting` {name}, `duelAbandon`.

No artwork ships. `CardArt`'s placeholder names the file it wanted —
`dueloTardeo01.png`, `dueloNoche01.png`–`02`, `dueloAfter01.png`–`02` — so the
pictures can land later with no code change.

## Deck

Totals held at **36 / 45 / 55**, 034's standing rule, so deck-exhaustion
behaviour is unchanged. Slots come from the forced-drink cards, on 034's
standing argument — and it is an especially clean trade here: an unasked-for
drink is swapped for one both players had to agree to.

| Venue | Add | Pay with |
|---|---|---|
| Tardeo | `dueloTardeo` 1 | `chupitoCasa` 2 → 1 |
| Noche | `dueloNoche` 2 | `chupitoCasa` 2 → 1, `garrafonEvent` 2 → 1 |
| After | `dueloAfter` 2 | `chupitoCasa` 4 → 3, `ronda` 3 → 2 |

The Noche's single Ronda is left alone rather than removed outright.

## Balance

Mean value of one duel drink, from each venue's alcohol deck:

| Venue | VP / drink | Intox / drink |
|---|---|---|
| Tardeo | 1.7 | 1.6 |
| Noche | 2.7 | 2.7 |
| After | 5.2 | 4.1 |

A six-drink After duel (three each) puts ~12 intoxication and ~15 VP on each
duelist, and **21 VP** in the winner's pool. For scale: Terraza 8, Cierrabares
9, Saltar la cola 7, La remontada capped at 20. It is the largest payout in the
deck, deliberately — held in check by the hidden limit (12 intox is most of a
16–28 band) rather than by the number, and by appearing at most twice a venue.

Unprobed. The simulator in `prototypes/magaluf/` does not run 034's rules, let
alone these. The first dial to turn is the copy count, then the rate.

## Open questions

1. **Armed Pastis.** A Pastis armed before the duel doubles the next drink, and
   the next drink may be a duel drink. Recommended: **let it** — it was armed
   before the duel, not used during it, and a Ronda already consumes it the same
   way.
2. **Host escape hatch.** A duelist who closes the tab holds the whole table,
   as a jumper would on the balcony. The balcony's answer is a host-only skip.
   But the host may *be* a duelist, and a skip that counted as a fold would let
   the host award themselves the pot. Recommended: `abandonDuel`, host-only,
   ends the duel **with no pot paid** — drinks stay drunk, the cap sweep still
   runs — so the host has nothing to gain by pressing it.
3. **Deck trades.** The table above is a recommendation, not a tuning.

## Non-goals / deferred

- **A host setting for `maxDrinks` / unlimited drinks.** Planned separately.
  The duel is written not to depend on it.
- **Ambulancia asking its victim.** The duel phase is the machinery 034 said
  that would need; reusing it is a separate change.
- **A stalled drawer.** A drawer who disconnects at the opponent picker holds
  the table, exactly as one at any existing choice card already does. Not the
  duel's problem to solve alone.
- **Simulator parity.**

## Acceptance criteria

- AC1 — A Duelo revealed with fewer than two seats partying has no effect, parks
  no choice, and pins `duelNobody` to the card.
- AC2 — Otherwise it parks `retar` / `dejarlo`; `dejarlo` does nothing.
- AC3 — `retar` parks an opponent pick; only the drawer may answer, and only
  with another `partying` seat — anything else is `INVALID_MOVE`.
- AC4 — Picking enters the `duel` phase with the target to act. Only the seat
  that owes the decision may drink or fold; every other seat is `INVALID_MOVE`.
- AC5 — A duel drink pours one alcohol card, draws no event, counts toward
  `drinksThisPhase`, and appears in `lastDraw.pours`.
- AC6 — Folding pays the other duelist `rate × (d + 1)` into the round pool and
  pins `duelResult` to the card. A fold at `d = 0` pays exactly the rate.
- AC7 — Duelists may pass `maxDrinks`; at duel end every seat at or over it is
  sent home, in the order they reached it.
- AC8 — No item can be used during a duel.
- AC9 — An empty alcohol deck mid-duel reshuffles its discard and the duel
  continues.
- AC10 — Duel end hands the turn on exactly as the drink that started it would
  have — including a Farlopa draw that keeps the drawer's action, and a venue
  that closes because the sweep emptied it.
- AC11 — `abandonDuel` is host-only, pays no pot, and still runs the sweep;
  `hostPlayerID === null` authorizes nobody.
- AC12 — Event deck totals stay 36 / 45 / 55.
- AC13 — Every new key exists in `en` and `es`, with one flavour line for
  `dueloTardeo` and two each for `dueloNoche` and `dueloAfter`.

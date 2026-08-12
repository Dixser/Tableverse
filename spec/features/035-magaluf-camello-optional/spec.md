# Feature 035 — Magaluf: the Camello asks first

## Description

One rule change to `magaluf-v1`, from the second table playtest: the three
Camello cards stop handing contraband over and start offering it. The player
takes the item or leaves it, and nothing else about the police changes.

Like features 033 and 034 this lands as a change to `magaluf-v1` rather than a
`magaluf-v2`, for the reason recorded there: no real match has been recorded
against the published definition, so there is no move log for boardgame.io to
replay against a changed `Game`.

## What the playtest found

The table's verdict on the game was good — funny, and not felt to be purely
random. One card was not: **the Redada was reported as punishing rather than
harsh**, and the sequence that produced that verdict is worth writing down
because it is the whole argument.

1. A player drew a Camello and was given a Porro. They were not asked.
2. The next player drew the Redada.
3. The first player was arrested — points banked early, out for the rest of
   the day — for an item they had never agreed to carry.

Nothing in that chain was a decision. Feature 034 removed exactly this shape of
problem everywhere else in the deck by giving the player a lever, and left the
one place where a card could make you *illegal* without asking. Arrest is a
severe outcome, and severity is only fair when it lands on a choice.

The Redada's own numbers are not the problem and are unchanged. What was wrong
was who it collected from.

## The change

The three Camello cards become choice cards, using the `options` machinery
feature 034 already built. No engine change is required — `EventOption` already
carries `givesItem`, which is exactly what `invitacion`'s `pillarKebab` branch
does.

| Card | Option A | Option B |
|---|---|---|
| `camelloPorro` | `pillarPorro` — givesItem porro | `dejarlo` — nothing |
| `camelloPastis` | `pillarPastis` — givesItem pastis | `dejarlo` — nothing |
| `camelloFarlopa` | `pillarFarlopa` — givesItem farlopa | `dejarlo` — nothing |

One decline id shared by all three, because the branch is identical and a
second label saying the same thing in three places would only be three things
to keep in step. The take branches stay separate: each names the item it hands
over, the way `pillarKebab` does, so the button reads as the offer rather than
as a generic yes.

Declining is a plain pass with no consolation. The item *is* the upside for
accepting; paying a player for turning it down would make the card's question
"which reward" instead of "is it worth the risk", which is the question the
playtest asked for.

Deck counts in `PHASE_RULES[*].events` are unchanged. The per-venue mix — more
Porro in the Tardeo, more Farlopa in the After — was always meant to express
what that venue's dealer is selling, and it still does; what changes is that
the offer can now be refused.

## What this does to the rest of the game

Contraband is now the only thing in Magaluf a player can hold **only** by
having chosen to. Both police cards are therefore fully opt-in, and the whole
contraband economy becomes a wager: the Porro's free turn, the Pastis doubler
and the Farlopa's extra drink against the odds of a Cacheo or a Redada before
you can spend it.

The second-order risk, flagged for the next playtest rather than pre-emptively
tuned: if the table declines every offer, Cacheo and Redada become dead cards.
That is a real possible outcome and it is deliberately not compensated for
here — the correct response depends on whether players actually decline, which
one playtest can answer and no amount of reasoning can. See non-goals.

## Non-goals / deferred

- **Retuning the police.** No change to `cacheo`'s −3, to the Redada's arrest,
  or to either card's count. If the next playtest shows the offers being
  refused across the board, the levers are the contraband item values first
  (make the wager worth taking) and the police counts second.
- **Choosing which contraband the Camello gives.** Still deferred, and still
  for feature 032's reason: the per-venue card counts express a dealer's mix
  that a single pick-your-item card could not. This feature answers *whether*,
  not *which*.
- **Simulator parity.** `prototypes/magaluf/` still runs pre-034 rules.

## Acceptance criteria

- AC1 — A Camello card is parked face-up in `G.pendingChoice` rather than
  resolved, with the card readable in `G.lastDraw`, and blocks every other
  move until it is answered — the contract feature 034's AC3/AC4 already set.
- AC2 — The take branch adds exactly that card's item and nothing else; the
  decline branch changes no player state at all.
- AC3 — A player who declined a Camello is not arrested by a Redada drawn by a
  later seat in the same phase; a player who accepted is.
- AC4 — Every new option id has a string in both `en` and `es`, and the board
  renders one button per branch for the three Camello cards.

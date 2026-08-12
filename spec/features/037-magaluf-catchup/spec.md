# Feature 037 — Magaluf: a way back in

## Description

Two rule changes to `magaluf-v1`, both from the same table playtest as 035 and
036:

- `reyGuiri` is **removed** from the game. Feature 036 retargeted it to the
  most intoxicated player, which is the stat Karaoke already reads.
- Two **catch-up** cards take its deck slots: `colecta` and `remontada`, both
  paying the player with the fewest points to their name, both paying straight
  into the bank.

As with 033–036 this changes `magaluf-v1` in place; no recorded match exists to
replay against a changed `Game`.

## What the playtest found

A player was arrested at the top of Saturday night. Arrest costs the rest of
the *day*, so they sat out the Noche and the After while the leader played
both — and there was no card in the deck capable of handing back a gap that
size. The rest of their weekend was arithmetic rather than a game.

The general form of the complaint: **the game had no way back in.** Feature 034
gave players levers over their own luck, but every lever paid the same
regardless of whether you were winning by 40 or losing by 40, so nothing in the
deck could reopen a match that had already been decided.

## The change

### A. Rey del guiri is removed

Feature 036 moved it onto intoxication over the partying seats. Karaoke reads
the same stat over the same field. The difference that remains — Karaoke always
pays its drawer and doubles conditionally, Rey del guiri retargets — was not
enough to earn five slots in two decks, and the deck had a better use for them.

One consequence recorded on purpose: the deck now has no card that *pays* for
intoxication other than Karaoke's double. Feature 036 noted that paying for
intoxication put a useful pull against the limit check; that pull is now
carried by Karaoke alone.

### B. Two catch-up cards

Both rank **everyone still in the running** — the cell and the sofa included,
the dead excluded — by **banked VP plus VP still at risk**, and both pay
**every seat tied at the bottom**.

| Card | Pays |
|---|---|
| `colecta` — the whip-round | A flat **+6**, banked |
| `remontada` — the comeback | **Half the gap** to the leader, capped at **20**, banked |

Three decisions here are load-bearing:

**They bank directly, unmultiplied.** `resolveNight` zeroes the round pool of
anyone in a cell, so a card handing VP through the ordinary `gainVP` path
reaches every player *except the one it exists for*. Banking is also the right
feel: a player who is already buried needs a floor, not another gamble.
Unmultiplied is not a nerf — the day multiplier is the rate at which the round
pool converts to bank, so N banked directly is N final points on any day.

**They read `alive`, not `partying`.** Every other retargeting card in the game
reaches only the room, and the police reach only the room for an
anti-loophole reason. These are the deliberate opposite: the standing they
settle belongs to the match, and the player they are for is usually the one who
is not in the room.

**The standing counts VP at risk.** Banked alone would read a player halfway
through a huge night as destitute; at-risk alone forgets the weekend so far.
Both is what the board already shows on every panel.

`remontada` being proportional is what makes the pair work at all. A flat card
large enough to matter after a lost night would be absurd when the table is
level; a proportional one is worth nearly nothing early and only bites once
somebody is genuinely adrift.

### C. Deck slots

Seven slots, and per-venue totals are held constant at 36 / 45 / 55:

| Venue | Freed | Spent |
|---|---|---|
| Noche | `reyGuiri` 2, `ronda` 1 | `colecta` 2, `remontada` 1 |
| After | `reyGuiri` 3, `ronda` 1 | `colecta` 2, `remontada` 2 |

The two Ronda slots follow feature 034's standing argument that the
forced-drink cards are the right thing to trade away, being the ones that spend
a player's capacity without asking. That trade compounds here: the player these
cards exist for is the one least able to afford an unasked-for drink.

## Tuning, and how it was set

By probe, not by feel. 200 simulated 4-player weekends across three drinking
strategies, before and after:

| | Before | After |
|---|---|---|
| Median winning score | 75 | 66 |
| Median final leader-to-last gap | 47 | 44 |
| Catch-up firings per match | — | 2.0 |
| **Median catch-up paid per match** | — | **12** |
| Most paid in one match | — | 51 |

So the pair returns a bit over a quarter of a typical final gap, and much more
than that to a player who has actually been buried — which is the shape asked
for: a way back in, not a refund.

The first tuning attempt (`colecta` +5 ×3, `remontada` cap 15 ×2, no Ronda
slots) returned a median of **6** against a gap of 47, which would have been a
gesture rather than a mechanic. The numbers above are what moved it into range.

Note for anyone reading `design.md` §13: its median winning score of 151 is the
pre-034 prototype's and does not describe this game. The figures here were
measured against the shipped engine.

## Non-goals / deferred

- **Shortening the arrest.** The obvious direct fix for the playtest story —
  release at the next phase boundary instead of the end of the day — is
  deliberately not taken. Feature 035 made contraband opt-in, so the arrest is
  now a consequence a player signed up for; softening it in the same pass as
  making it voluntary would be paying for the same problem twice. If the next
  playtest still finds arrest too long, that is the lever, and it should be
  pulled on its own evidence.
- **Rubber-banding anything but VP.** No extra draws, no bonus items, no turn
  order advantage for the trailing player. All of those reach only a player who
  is at the table, which excludes the case that prompted the feature.
- **Catch-up in the Tardeo.** Nothing has been decided by Friday afternoon, and
  the budget came from cards that only ever lived in the Noche and the After.
- **Simulator parity.** `prototypes/magaluf/` still runs pre-034 rules.

## Acceptance criteria

- AC1 — `reyGuiri` no longer exists as an `EventId`, in any deck, or in either
  locale.
- AC2 — Per-venue event deck totals are unchanged at 36 / 45 / 55.
- AC3 — `colecta` banks its flat value to every seat tied at the fewest points,
  and puts nothing at risk.
- AC4 — `remontada` banks `min(floor(gap / 2), 20)`, and reports both the gap
  it measured and the standings it measured it from.
- AC5 — Both cards reach a player who is arrested or withdrawn, and neither
  reaches a dead player.
- AC6 — The standing ranks on banked plus at-risk VP, not banked alone.
- AC7 — `remontada` on a level table reports `remontadaNobody` rather than
  silently paying zero.

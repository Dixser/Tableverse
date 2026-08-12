# Feature 036 — Magaluf: the crown goes to the drunkest, not to the first chair

## Description

One rule change to `magaluf-v1`, from the same table playtest as feature 035:
`reyGuiri` stops ranking players by how many times they drank this phase and
ranks them by intoxication instead, over the seats still partying.

As with 033–035, this lands as a change to `magaluf-v1`. No real match has been
recorded against the published definition, so there is no move log for
boardgame.io to replay against a changed `Game`.

## What the playtest found

Rey del guiri paid +3 VP to whoever had drunk most this phase. Play is
clockwise and nearly every turn is a drink, so the drink count is very close to
a function of seat order:

- After *k* laps the seat that opened the phase has *k* drinks and everyone
  behind it has *k* or *k−1*.
- So the card either paid the opening seat, or it paid the whole table at once
  because everyone was level.

Neither outcome is a decision. The players read it correctly: the card looked
like a reward for drinking hard and was actually a reward for where you were
sitting, and the tie case handed +3 to everybody, which is the same as handing
it to nobody.

The old test suite had this encoded as intended behaviour, in a comment reading
"Seat 0's own drink puts it one ahead of the other two" — the bug, asserted.

## The change

`reyGuiri` ranks `partying(G)` by `player.intox`. Everything else about the
card — the +3, the deck counts, the two log entries, paying every seat tied at
the top — is unchanged.

`rankSeats` gains an optional `seats` argument, defaulting to
`G.activeSeatIDs`, so a card can narrow the field to the people still in the
venue.

Two things this buys beyond removing the seat-order bias:

**Intoxication actually varies.** Alcohol cards run 1–6 intoxication, and
events, items and resaca push it further, so the spread between seats after a
few laps is wide. The opening seat still averages one extra drink, but one
extra drink is worth 1–6 against a table whose totals differ by much more than
that. Drink counts differed by at most one, always.

**"The drunkest" becomes one thing across the deck.** Karaoke doubles for the
drunkest and the Ambulancia takes the drunkest away, both over `partying(G)`.
Rey del guiri was measuring a different number over a different population —
`G.activeSeatIDs`, which included players who had already gone home. Now all
three cards read the same stat over the same field, which is one rule to
explain at the table instead of two.

The restriction to partying seats is a real behaviour change on its own: a
player who withdrew early could previously still be crowned. That is now
impossible, matching every other card that reaches "the drunkest".

## What this does to the rest of the game

Intoxication was pure downside everywhere except Karaoke's conditional double:
it is the number that sends you to the balcony. Rey del guiri now pays for it
outright, which puts a real pull in the opposite direction from the limit
check. Pushing toward the limit becomes a bet with a payout rather than only a
risk, and the card rewards the player who is genuinely closest to dying.

Ties are still paid to everyone holding the top value, deliberately. Any
deterministic tiebreak available here — seat order, drink count — reintroduces
exactly the positional bias this feature removes, and on intoxication a tie is
now uncommon rather than the expected outcome.

## Non-goals / deferred

- **The Ambulancia's tiebreak.** It keeps `drunkestSeat`, which resolves a tie
  by seat order, because it has to remove exactly one player from the phase and
  cannot pay a shared crown. A tie there is broken silently by position, which
  is accepted: it is a single victim, not a scoring race.
- **`barraLibre`.** It also pays on the drink count, but each player is scored
  against their own total when they draw it rather than raced against the
  table, so seat order does not decide anything. Unchanged.
- **Retuning the +3.** The card's value is untouched until a playtest says the
  new targeting has changed what it is worth.
- **Simulator parity.** `prototypes/magaluf/` still runs pre-034 rules.

## Acceptance criteria

- AC1 — Rey del guiri pays every partying seat tied at the highest
  intoxication, and the `reyGuiriRanking` entry lists partying seats only,
  highest first.
- AC2 — A seat with more drinks but less intoxication does not win.
- AC3 — A seat that has left the phase is neither crowned nor listed, however
  intoxicated it is.
- AC4 — With every partying seat on zero intoxication the card reports
  `reyGuiriNobody` and pays nobody.

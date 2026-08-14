# Feature 039 — Magaluf: open the player range for playtesting

## Description

`magaluf-v1` moves from **3–6 players** to **2–10**, and the decks' empty-pile
rule stops being a deadlock guard and becomes a real part of the game.

The range is widened *for the playtest*, not because either new end is claimed
to be good. Both ends are there to be measured:

- **2** is still structurally soft, for exactly the reason 032 recorded when it
  set the floor at 3: forced-consumption events reach "everyone still
  partying", so a two-person table generates almost no unavoidable
  intoxication and every drink becomes a choice you can decline. It is allowed
  anyway because it is the cheapest way to show somebody the core loop, and
  the engine has no rule that structurally needs a third seat.
- **10** keeps every rule intact but makes a phase nine laps long, and — this
  is the interesting part — outdraws the decks.

3–6 remains the tuned range. Nothing about the tuning changed.

## The decks

`drawAlcohol` and `drawEvent` already reshuffled the discard when a deck ran
out. Up to six players that branch was dead code: every phase deck is larger
than the maximum possible draws at six seats, which is what the comment above
it claimed and what the AC21 test proved.

At ten it fires. The Tardeo deals 34 alcohol cards against a table that can
drink 40 before closing time, so a ten-seat venue runs the deck out and goes
round again. Nothing had to be built for that — it is why the branch was
written — but two things changed:

- The reshuffle is now **logged** (`reshuffledAlcohol` / `reshuffledEvent`,
  with the number of cards swept up). At a physical table somebody visibly
  gathers the discards, and a phase where the same Pecera comes round twice
  should not read as the app repeating itself.
- The two draw functions share one `refill` helper rather than each carrying
  its own copy of the same four lines.

What this costs, and it is worth watching in the playtest: a venue whose deck
comes round twice is a venue where the drink distribution is no longer a fixed
sample. Counting what is left stops being reliable in the third quarter of a
big Tardeo.

## Non-goals

- **Scaling deck size by player count.** The alternative to reshuffling is
  dealing a bigger deck at a bigger table — two Tardeo decks at eight-plus
  seats. That keeps the sampling honest but doubles the card counts to tune,
  and reshuffling is what a real table does when it runs out. Reshuffle first;
  measure; scale only if the playtest says the sampling actually matters.
- **Retuning anything for 2 or 10.** No card count, no phase rule, no
  multiplier moved. The point of the playtest is to find out what the ends
  need, and pre-guessing that would make the results unreadable.
- **Shortening the game at a big table.** Ten players will run long. Whether
  that wants a two-day weekend, a lower `maxDrinks`, or nothing at all is a
  question for after the first ten-handed session.
- **A minimum-players gate in the room lobby.** `startMatch` never enforced
  `minPlayers`; that is platform behaviour shared by every game and unchanged.

## Acceptance criteria

- AC1 — `magalufModule` reports `minPlayers: 2`, `maxPlayers: 10`, and the
  room's seat picker renders ten seats.
- AC2 — `validateMagalufSetupData` accepts two claimed seats and rejects one.
- AC3 — A full weekend at two seats reaches Monday.
- AC4 — A full weekend at ten seats reaches Monday, having reshuffled at least
  one alcohol deck on the way.
- AC5 — Across that ten-seat weekend, deck + discard always equals the phase's
  full alcohol deck: no card is lost or duplicated by a reshuffle.
- AC6 — A reshuffle writes a log line naming which deck and how many cards, in
  both languages.

## Verification

AC2–AC6 are unit tests in `gameDef.test.ts` → *decks (AC21)*. The old test in
that block — "never needs a mid-phase reshuffle at maxPlayers" — was not
deleted but **repointed at 6**, which is what it was really asserting: the
decks are sized against the tuned table. It would now be false at ten, and that
is the change rather than a regression.

AC1 and AC3 were checked in the running app: the lobby renders ten seat
buttons, a two-seat match starts and deals a board with both panels, and a
ten-seat match lays out ten panels in the existing two-column grid with no
horizontal overflow at desktop or mobile width (it scrolls vertically, which
is what a ten-player table costs).

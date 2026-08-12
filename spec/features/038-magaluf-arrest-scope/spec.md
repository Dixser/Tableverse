# Feature 038 — Magaluf: how long the cell holds you

## Description

One new room setting on `magaluf-v1`: `arrestLasts`, a select with two values.

- `'day'` — the shipped rule, and the default. Arrested, and out for every
  remaining phase of that day.
- `'phase'` — released at the next venue.

Feature 037 deferred shortening the arrest on the grounds that 035 had just
made contraband opt-in, and softening the consequence in the same pass as
making it voluntary would pay for the same problem twice. That argument stands
for changing the rule outright. It does not stand against making it testable:
more feedback has arrived on this exact rule, the table likes knowing the risk
it is taking, and both readings are defensible. So it becomes a dial rather
than a decision, and the next playtest settles it with evidence.

## The change

`MagalufSettings` gains `arrestLasts: ArrestScope`. `startPhase` already
resurrects `'withdrawn'` seats at a venue boundary; under `'phase'` it does the
same for `'arrested'` ones and logs a new `released` line.

No client work was needed. `SettingsForm` already renders any schema property
carrying an `enum` as a `<select>`, which is how `limitRevealAt` and
`balconyDie` are presented, so declaring the property is the whole of the UI.

Two strings changed rather than being added:

- `log.arrested` said "day over" / "se le acaba el día", which is now only true
  under one of the two settings. It is neutral: the VP is banked and they are
  taken away. When they come back is the `released` line's business.

## What the shorter sentence actually does

Worth stating plainly, because it is not a pure softening. An arrest **banks
the round pool on the spot** at the day's multiplier. Under `'phase'` a player
is then back in the next venue with a fresh pool. So the Redada becomes a
partial hedge: the day's points so far are locked in and can no longer be lost
to the limit check, and there is still a night left to earn more.

That is not directly exploitable — nobody chooses when a Redada appears, and a
Cacheo will often take the contraband first — but it does mean the card can
land as a mixed blessing rather than a punishment, which is a different game
from the one `'day'` produces. It is the thing to watch in the playtest.

What does *not* change: the limit-check exemption belongs to whoever is still
in a cell at midnight. A player let out at eight o'clock drank the rest of the
night like everybody else and answers for it like everybody else.

## Non-goals

- **Making `'phase'` the default.** The shipped rule stays the default so an
  existing room's balance is unchanged unless a host opts in.
- **A third scope** (out for N turns, released on a die roll). Two readings
  were asked for; a dial with two positions is the smallest thing that answers
  the question.
- **Translating the settings form.** Every `title` in this schema is raw
  English and the `<select>` prints raw enum values, which is the platform's
  existing behaviour for every game. Out of scope here.

## Acceptance criteria

- AC1 — `arrestLasts` appears in the room settings form as a select of
  `phase` / `day`, defaulting to `day`.
- AC2 — An unrecognised value falls back to `day` in `clampSettings`, and is
  rejected by `validateGameSettings` rather than silently accepted.
- AC3 — Under `day`, an arrested player is still arrested at the next venue and
  no `released` line is logged.
- AC4 — Under `phase`, they are partying at the next venue with a fresh drink
  count, and the release is logged.
- AC5 — A player released under `phase` faces that night's limit check.

## Verification

AC2–AC5 are unit tests. AC5's test was confirmed to fail when the setting is
flipped to `day`, so it is asserting the rule rather than agreeing with the
engine by accident.

AC1 and AC2 were checked in the running app rather than only in tests: the form
renders six fields, the new one a `<select>` of `[phase|day]` defaulting to
`day`; saving POSTs to the room settings endpoint and returns 200; and in-page,
`validateGameSettings` accepts `'phase'` and rejects `'forever'` with a
field-level message while `clampSettings` falls that same value back to `day`.

# Feature 039 — Open the player range: plan

## Shape of the change

Two numbers and a shared helper. There is no new rule here — the widened range
only exposes a code path (`refill`) that was already written and never ran.

## Files

| File | Change |
|---|---|
| `index.ts` | `minPlayers: 2`, `maxPlayers: 10`, and the comment rewritten: the old one justified the floor at 3, which is now the tuned range rather than the hard limit. |
| `gameDef.ts` | `validateMagalufSetupData`'s claimed-seat floor 3 → 2. |
| `state.ts` | `drawAlcohol` / `drawEvent` share one `refill<T>` helper, which logs the sweep-up. The stale "should never actually happen" comment replaced with what is now true. |
| locales (en/es) | `log.reshuffledAlcohol`, `log.reshuffledEvent`. |
| `docs/magaluf/how-to-play.{en,es}.md` | The header line says 3–6 tuned, 2–10 in playtesting, and what each end costs. |

Nothing in `packages/server` or `packages/client` needed touching.
`startMatch` already creates `gameModule.maxPlayers` engine seats and passes
`claimedSeatIDs`, and `RoomShell` already renders `maxPlayers` seat buttons —
so ten seats appear for free. That is the platform contract working as
designed.

## Why `refill` rather than two copies

The two draw functions had the same four lines twice, and the log line would
have made it six. It is generic over the card id type (`string` for alcohol,
`EventId` for events) and takes the log key rather than a deck name, so the
message can be a plain sentence in each language instead of a nested
`descriptionKey` fragment.

It returns the new pair rather than mutating `G` in place, so the caller does
the assignment — the same shape the existing code had, and it keeps the helper
from needing to know which two fields on `G` it is holding.

## Tests

`gameDef.test.ts` → *decks (AC21)*:

| Test | Covers |
|---|---|
| never needs a mid-phase reshuffle at the top of the tuned range (now 6, not `maxPlayers`) | the deck-sizing guarantee 032 established |
| reshuffles the discard and plays on when a deck runs out at `maxPlayers` | AC4, AC5, AC6 |
| plays a whole weekend at `minPlayers` | AC3 |

Plus the existing setup-validation test, repointed from `['0','1']`/`at least
3` to `['0']`/`at least 2` (AC2).

The conservation assertion in the ten-seat test is the one that would actually
catch a broken reshuffle: a helper that dropped the discard, or shuffled it
back without clearing it, both leave a match that still finishes.

## Verification

Checked in the running app (the dev servers were already up): ten seat buttons
in the lobby, a two-seat match starts and renders both player panels with the
34/36-card decks dealt, and a ten-seat match lays out ten panels in the
existing `repeat(2, 1fr)` grid — 767px tall at desktop, 912px at mobile width,
no horizontal overflow at either.

`npm run test:unit` 1101 passed, `npm run typecheck` clean, `npm run lint`
unchanged from `main` (3 pre-existing errors, none in touched files).

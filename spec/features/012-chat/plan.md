# Feature 012 — Room & Match Chat: Implementation Plan

## Two independent data sources feeding one merged UI

Free-text chat and game-status messages are **not** built on the same
transport, deliberately:

|  | Free-text chat | Game-status messages |
|---|---|---|
| Origin | A room member's own input | A game's own move logic |
| Transport | New dedicated `/chat` Socket.IO namespace (server relays) | `G.log`, already replicated by boardgame.io's own state sync — no new transport |
| Server involvement | Authors, stores, filters, and relays every message | None — the server never inspects or generates these |

### Why game-status messages are *not* server-generated from a move diff

The tempting design — have the server watch every move applied to a match
and derive a status message from the `G` diff — is unsound given how
boardgame.io actually works, not just more complex than necessary:
**moves are boardgame.io's own deterministic reducer, replayed to
reconstruct state (e.g. on reconnection sync) without any live socket or
side-effect channel attached.** A move that pushed a chat message as a
side effect (an HTTP call, a socket emit) would either double-send on
every replay or silently do nothing during a replay with no server-side
listener attached — neither is acceptable. This is the same category of
constraint tech-stack.md already states plainly for randomness ("All
randomness must go through boardgame.io's `random` plugin API, never
`Math.random()`").

The sound alternative — and the one this plan uses — is for a game's own
moves to append structured, translatable entries directly into `G` itself,
the same replay-safe medium every other piece of game state already lives
in. Every client already receives every update to `G` (that's how the
board itself re-renders), so once a game writes to this reserved field, no
new delivery mechanism is needed at all — the client-side chat UI just
reads it off the already-live `boardProps.G` it's already receiving.

### The `GameLogEntry` / `G.log` contract

Added to `packages/game-core/src/types.ts`, alongside `GameoverResult` —
same status: a documented convention on top of `G`, not something
`GameModule`'s type enforces (there is no way to type-check "this game's
`G` optionally has a `log` field of this shape" generically across every
game's own `G` type without constraining every future game's state shape,
which this repo has deliberately avoided doing anywhere else).

```ts
/**
 * One system-generated, translatable game-status entry. A game's own moves
 * may append these to a reserved `log` field on G (G['log']: GameLogEntry[])
 * to describe public events (a card played, a player eliminated) in the
 * shared chat feed -- see spec/features/012-chat/plan.md for why this lives
 * in G itself rather than being pushed through a side channel: G is the
 * only replay-safe medium boardgame.io moves have.
 *
 * Reserved field name: any GameModule that wants status messages in chat
 * must name the field exactly `log` on its G. Append-only -- entries are
 * never removed or mutated once pushed, so the client can diff by array
 * length to find what's new since the last render. Never contains
 * anything a playerView would need to hide -- by construction this field
 * must only ever hold PUBLIC information, since (unlike a per-player
 * secret field) it is never filtered out of any player's or spectator's
 * view.
 */
export interface GameLogEntry {
  /** i18next translation key, e.g. "loveLetter.log.eliminated". */
  key: string;
  /** Interpolation params for the translation (i18next's `t(key, params)`). */
  params?: Record<string, string | number>;
}
```

No change to `GameModule`, `gamesCatalog.ts`, or `boards.ts` — exactly like
`GameoverResult`, this is a type export plus a documented field-name
convention a game's own `gameDef.ts` opts into.

## Public/private split — why a card reveal is never chat content

Restating spec.md's resolved decision with the mechanism: a per-player
secret (e.g. the actual rank of a card the Baron move reveals to exactly
one other player) belongs in a **per-player-keyed field on `G`**, filtered
by that game's own `playerView` the same way every other hidden field
already must be (tech-stack.md's "Hidden information rule", the
conformance suite's `secretKeys` check). It is structurally impossible for
such a field to leak into chat, because chat only ever reads the `log`
field — a different field, always public by the reserved-field-name
contract above. Feature 013's own specs define the concrete shape Love
Letter uses for this (its own `G.privateReveals`-shaped field, or
equivalent); this feature does not need to know that shape, only that
`log` is never it.

## Server: `/chat` namespace

`packages/server/src/chat/chatChannel.ts`, structurally mirroring
`presenceChannel.ts`'s `createPresenceSystem` — own Socket.IO namespace
(`/chat`), own engine.io path (`/chat-socket`), joined per-`roomID` Socket.IO
room. Differs from presence in one important way: **identity is verified
against a real session token**, not trusted from an unauthenticated
client-supplied payload. Presence's `hello` doesn't need this (a forged
`playerID` in a presence payload can't do anything beyond mis-render a
badge — no seat action is gated on it), but chat messages carry a
human-readable author identity broadcast to every other member, so
impersonation is a real, visible risk this feature must not introduce.

```ts
interface ChatHelloPayload {
  roomID: string;
  sessionToken: string;
}
```

```ts
export interface ChatMessage {
  id: string;
  roomID: string;
  authorUserID: string;
  /** Snapshotted at send time (matches the existing matchData/player-name
   * snapshot pattern from feature 009 — a member who later changes their
   * display name, or leaves the room, doesn't rewrite history). */
  authorDisplayName: string;
  /** Frozen at send time, per spec.md's resolved decision. */
  authorWasSeated: boolean;
  body: string;
  sentAt: string; // ISO
}
```

`ChatStore` (`packages/server/src/chat/chatStore.ts`), an in-memory,
per-room capped ring buffer — same "single-server-instance design for the
MVP" precedent as `PresenceStore`:

```ts
export class ChatStore {
  private readonly messagesByRoom = new Map<string, ChatMessage[]>();
  private static readonly MAX_PER_ROOM = 200;

  append(message: ChatMessage): void { /* push, then trim to MAX_PER_ROOM from the front */ }
  historyFor(roomID: string, viewerIsSeated: boolean): ChatMessage[] {
    /* all messages where authorWasSeated || !viewerIsSeated */
  }
}
```

`createChatSystem(httpServer, { users, rooms, seats }, corsOrigins)`:

1. On `hello`, resolve `userRepository.getBySessionToken(sessionToken)`. No
   user, or user not present in `room.members` for `roomID` → reject
   (disconnect the socket; spec.md AC6), never join the Socket.IO room.
2. On success: `socket.join(roomID)`; compute `viewerIsSeated =
   (await seats.getSeatsForRoom(roomID)).some(s => s.userID === user.id)`;
   emit `chatHistory` with `chatStore.historyFor(roomID, viewerIsSeated)`
   (spec.md AC5).
3. On `sendMessage` (`{ roomID, body }`, from an already-`hello`'d socket):
   re-derive `authorWasSeated` fresh (seat status may have changed since
   `hello`), construct a `ChatMessage`, `chatStore.append(...)`, then
   **iterate the Socket.IO room's connected sockets individually** (not a
   single `.to(roomID).emit(...)`, since delivery depends per-recipient on
   *their* current seated status) — for each socket, recompute that
   socket's own current `viewerIsSeated` and emit `chatMessage` only if
   `message.authorWasSeated || !thatSocketsViewerIsSeated` (spec.md AC3/4).
   Small-room scale (mission.md's target audience) makes a per-socket
   seat-status lookup on every send acceptable; no caching layer added.
4. `body` is capped at a fixed length (e.g. 500 chars) and trimmed;
   empty-after-trim messages are rejected without being stored or
   broadcast.

## Client: `useChat` hook + `ChatPanel` component

`packages/client/src/chat/useChat.ts`, structurally mirroring
`usePresence.ts` — connects to `/chat` on mount, sends `hello` with
`{ roomID, sessionToken }`, accumulates `chatHistory` (replacing local
state) then appends live `chatMessage` events; exposes `sendMessage(body)`
which emits `sendMessage` over the same socket. Reconnect-on-remount
behavior (new `roomID`) matches `usePresence`'s existing effect-cleanup
pattern exactly.

`packages/client/src/chat/ChatPanel.tsx` — merges `useChat`'s live message
list with `gameLogEntries` (see below) into one rendered feed, each
free-text row showing `authorDisplayName` + `body`, each system row
rendering `t(entry.key, entry.params)` (spec.md AC8). Per spec.md AC9, an
absent/empty `gameLogEntries` array renders no system rows at all — no
special-casing needed since merging an empty array is a no-op.

Ordering (documented limitation, not solved further — see Open risks):
free-text messages sort by `sentAt` (a real server timestamp); each
`GameLogEntry` is stamped with `Date.now()` **at the moment the client
first observes it** (new array index since the last render) and sorted
into the same list by that client-local timestamp. This is exact for any
entry observed while already connected; it is only approximate for a
client that just connected or reconnected, since every not-yet-seen
`G.log` entry existing at that moment gets the same "just now" timestamp
and sorts as a block relative to older chat history, rather than
interleaved at its true historical position.

`ChatPanel` needs `boardProps?.G`'s `log` field, which only `ActiveRoom`
(the component in `App.tsx` that already holds `useSeatClients`'s
`boardProps`) has — `RoomShell` itself never touches `G`. `RoomShell`
gains one new prop, threaded straight to `<ChatPanel>` alongside its
existing chrome (per the `types.ts` doc comment's own foreshadowing:
"player list, seat management controls, connection/presence badges, and
(if ever added) chat" — this is that):

```ts
export interface RoomShellProps {
  // ...existing props...
  /** Raw G.log if present on the active match's G -- unknown, not
   * GameLogEntry[], since a non-conforming game's G shouldn't crash the
   * panel (same defensive posture as GameoverBanner's `gameover: unknown`). */
  gameLog?: unknown;
}
```

A small pure function, unit-tested independent of rendering (mirroring
`resolveGameoverMessage`'s pattern):

```ts
export function extractGameLogEntries(gameLog: unknown): GameLogEntry[] {
  if (!Array.isArray(gameLog)) return [];
  return gameLog.filter(
    (e): e is GameLogEntry =>
      typeof e === 'object' && e !== null && typeof (e as GameLogEntry).key === 'string',
  );
}
```

`ActiveRoom` passes `gameLog={seatClients.boardProps?.G && (seatClients.boardProps.G as { log?: unknown }).log}`
— mirrors the existing `boardProps.ctx.gameover` read for `GameoverBanner`,
same "reach into the already-available boardProps, don't add new state."

## File layout

```
packages/game-core/src/
  types.ts        # + GameLogEntry
  index.ts        # + export type { GameLogEntry }

packages/server/src/chat/
  chatStore.ts        # + chatStore.test.ts
  chatChannel.ts       # createChatSystem(...)
  chatChannel.integration.test.ts   # real-socket tests, mirroring presenceChannel's

packages/server/src/index.ts   # + createChatSystem(...) wiring, alongside createPresenceSystem

packages/client/src/chat/
  useChat.ts          # + useChat.test.ts
  ChatPanel.tsx        # + ChatPanel.module.css
  ChatPanel.test.tsx   # incl. extractGameLogEntries table tests

packages/client/src/room/
  RoomShell.tsx        # + gameLog prop, renders <ChatPanel>

packages/client/src/App.tsx   # ActiveRoom passes boardProps' G.log through to RoomShell
```

## i18n

New translation keys under a `chat.*` namespace (feature 010's existing
`en`/`es` resource files) for the panel's own chrome (input placeholder,
send button, "spectator" mode hint if any). Game-status message keys
themselves (e.g. `loveLetter.log.eliminated`) are added by whichever game
defines them — feature 013, not this feature — since this feature never
emits any itself (spec.md's explicit non-goal).

## Testing / verification strategy

- `chatStore.test.ts` — cap-at-200 eviction (spec.md AC7), `historyFor`
  filtering logic (AC1/AC2) as pure unit tests, no socket involved.
- `chatChannel.integration.test.ts` — a real Socket.IO server/client pair
  (same pattern as any existing `/presence` integration coverage), two
  connected clients (one seated, one not, seeded via the same
  seats/rooms fixtures `roomService`'s integration tests already use):
  AC3 (spectator message not delivered to seated), AC4 (seated message
  delivered to both), AC5 (hello returns pre-filtered history), AC6
  (invalid token / non-member rejected before join).
- `extractGameLogEntries` unit tests: empty/missing `log`, malformed
  entries filtered out, well-formed entries passed through unchanged.
- `ChatPanel.test.tsx` — renders merged feed from a fixture (mocked
  `useChat` + a `gameLog` prop), asserts translated system rows appear
  correctly interleaved by the sort rule above, and that an absent
  `gameLog` renders zero system rows (AC9).
- Manual/browser verification (spec.md AC10/AC11): three real sessions
  (two seated, one spectator) in one room against Tic-Tac-Toe (chat
  works identically with zero `G.log` activity, since Tic-Tac-Toe never
  populates it) confirms the free-text filtering rule end-to-end; the
  `G.log` rendering path itself can only be manually verified once
  feature 013 ships a game that populates it.

## Open risks

1. **System-message ordering for a client that just connected is only
   approximate** relative to chat history's real timestamps (see
   "Client: useChat hook" above) — accepted, flagged, not solved further
   for the MVP; a room's chat feed is a casual side-channel, not an
   audit log, so an occasional slightly-out-of-order status line among
   older chat history is a minor cosmetic issue, not a correctness one.
2. **Per-socket seat-status recomputation on every `sendMessage`** is an
   `O(connected sockets in room)` seat lookup per message. Fine at
   mission.md's target scale (small private rooms); flagged here as the
   thing to revisit first if chat is ever used at a scale this repo isn't
   designed for.
3. **No devDependency currently exercises a real two-client Socket.IO
   integration test against a namespace requiring session-token
   auth** (presence's own integration coverage, if any exists, doesn't
   need this since presence trusts its payload) — `chatChannel
   .integration.test.ts`'s exact fixture setup (spinning up a real
   `UserRepository`/`SeatService` against a throwaway DB, per this
   repo's existing `test:integration` pattern) is left as an
   implementation-time detail rather than locked here.

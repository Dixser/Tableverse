# Feature 012 — Room & Match Chat

## Description

Reverses mission.md's original MVP exclusion ("Spectator chat or any chat
system") by explicit user request. Adds one merged chat feed per room,
carrying two kinds of entries:

1. **Free-text messages**, sent by any room member (seated player or
   spectator) via a new real-time chat channel.
2. **Game-status messages** — short, system-generated announcements of
   public game events (e.g. "Player A is defeated", "Player C chooses to
   pass"). These are not written by this feature's own code; this feature
   defines the contract a `GameModule` uses to produce them (see plan.md's
   `GameLogEntry`/`G.log` design) and renders whatever a game populates.
   No shipped game populates it yet — Tic-Tac-Toe needs zero changes,
   exactly as feature 009/010 needed none; feature 014 (Love Letter's
   rules engine) is the first game to actually emit any.

The one behavioral rule this feature is built around, per explicit user
request: **a message sent by a spectator (a room member holding no seat at
the moment they sent it) is visible only to other spectators — never to a
seated player.** This exists to prevent a spectator's commentary (which may
reflect more information than any single seated player has, e.g. having
watched the whole board from the start, or — once a hidden-information game
like Love Letter ships — potentially having a wider view than any one
seated player) from leaking as an unfair hint to someone still playing.
Every other kind of message (a seated player's own chat, and every
game-status message, since those only ever describe information already
public on the board) is visible to everyone in the room, seated or not.

## Resolved design decisions

Called out up front since they shape every acceptance criterion below.

- **Chat is scoped to the Room, not the Match.** The feed spans lobby time
  and every match played in that room (rematches included) — consistent
  with Room being the durable entity and Match being ephemeral
  (tech-stack.md's "Room vs Match"). Ending a match does not clear chat.
- **"Seated" is evaluated per-message, frozen at send time**, not
  re-evaluated later against the sender's current status. A message sent
  while spectating stays spectator-only forever, even if its sender later
  claims a seat (including to that same user, once seated — no
  "except-my-own-messages" special case). This keeps the filtering rule
  a pure function of stored data, with no dependency on who the current
  viewer happens to be relative to the message's author.
- **No persistence to SQLite for the MVP.** Chat history lives in server
  memory only (capped at the most recent 200 messages per room), lost on
  server restart — the same MVP-scoped tradeoff already accepted for
  presence state (`PresenceStore`, "single-server-instance design").
- **No moderation, rate-limiting, or profanity filtering.** Consistent
  with mission.md's target audience (small groups of friends/acquaintances,
  not public matchmaking) — the same trust level already extended to every
  other room action.
- **Private, per-player information revealed by a game move (e.g. Love
  Letter's Baron comparison) is never chat content.** Chat only ever
  carries what's already public. A card revealed to exactly one player
  is that game's own `BoardComponent`'s responsibility to display,
  filtered the same `playerView` way every other hidden field already is
  — see plan.md's "Public/private split" and features 014/015's specs for
  the concrete Love Letter case this generalizes from.

## User stories

### 1. Seated players and spectators chatting together

As a room member, seated or not, I can type a message and see it appear in
one shared feed alongside everyone else's messages, so the room has a
single place to talk instead of a separate spectator-only side channel.

### 2. A spectator's message never reaches a seated player

As a spectator, when I send a message, only other current spectators (and
no seated player) see it — confirmed by two simultaneous sessions, one
seated and one not, where only the unseated session's feed shows the
message.

### 3. A seated player's message reaches everyone

As a seated player, when I send a message, every room member sees it —
seated players and spectators alike — since a seated player's own words
carry no extra information a spectator doesn't already have access to.

### 4. Following the game through status messages

As any room member, when a game-status event happens (e.g. a player is
eliminated, a player passes), I see a short system message describing it
in the same feed as regular chat, without needing to parse the board state
myself to notice it happened.

### 5. Joining mid-match sees relevant history, correctly filtered

As a room member who joins or reconnects partway through a room's
lifetime, I immediately see the recent chat history appropriate to my
current status — every seated-authored message and status message, plus
spectator-authored messages only if I am currently a spectator myself —
without needing to have been connected when those messages were originally
sent.

### 6. Switching from spectator to seated mid-conversation

As a spectator who then claims a seat, my own further messages (and every
new message from anyone else) are sent under my new seated status; the
message log itself does not retroactively change — my own past
spectator-only messages remain visible to spectators (and to me, while I
was still one of them), consistent with the frozen-at-send-time rule.

## Acceptance criteria

`[unit]` denotes a server-side test of the chat message store/filtering
logic in isolation. `[integration]` denotes a test against a real Socket.IO
connection (mirroring the existing `/presence` integration test pattern).
`[component]` denotes a client-side test of the chat UI in isolation.
`[manual]` denotes verification via the real dev server with multiple
browser sessions.

1. `[unit]` A message authored by a user holding no seat in the room at
   send time is tagged spectator-only; a message authored by a user
   holding at least one seat is tagged visible-to-all.
2. `[unit]` Given a set of stored messages and a viewer's current seated
   status, filtering returns every visible-to-all message plus
   spectator-only messages only when the viewer is currently unseated
   themselves.
3. `[integration]` Two connected sockets identified as different users in
   the same room, one seated one not: a message sent by the unseated
   socket is delivered (live) only to the unseated socket's own connection,
   never to the seated one's.
4. `[integration]` The same setup: a message sent by the seated socket is
   delivered to both connections.
5. `[integration]` A socket's `hello` handshake, on connecting or
   reconnecting, receives the existing message history for that room
   already filtered per that socket's current seated status (story 5) —
   not the raw unfiltered log.
6. `[integration]` A socket presenting no valid session token, or one that
   resolves to a user who is not a member of the target room, is rejected
   before joining the room's chat channel or receiving any history.
7. `[unit]` The in-memory store caps stored history at 200 messages per
   room, discarding the oldest first — confirmed by inserting 250 messages
   and asserting exactly the most recent 200 remain queryable.
8. `[component]` A game-status entry present in a mounted match's `G.log`
   (per plan.md's `GameLogEntry` contract) renders in the chat feed as a
   translated system message (i18next key + params), interleaved with
   regular chat entries.
9. `[component]` With no `G.log` field present on `G` (e.g. Tic-Tac-Toe, or
   no match currently active), the chat feed renders free-text messages
   only, with no error and no empty/placeholder system-message rows.
10. `[manual]` Three real browser sessions in one room — two seated players
    and one spectator: spectator's message appears in the spectator's own
    feed but neither seated player's; either seated player's message
    appears in all three feeds; confirms stories 2 and 3 end-to-end.
11. `[manual]` A fourth session joins the same room after several messages
    have already been sent (mix of seated- and spectator-authored) and
    confirms it receives the correctly filtered history immediately on
    connecting, per its own current (unseated, i.e. no seat claimed yet)
    status.

## Non-goals

- Direct/private messaging between two specific members — one shared feed
  per room only.
- Message editing or deletion.
- Read receipts, typing indicators, or unread-message badges.
- Persisting chat history beyond server-process lifetime (see "Resolved
  design decisions").
- Rate-limiting, moderation, or content filtering.
- Any change to how a game's private/hidden information reaches the
  player it belongs to — that remains exclusively `playerView` +
  `BoardComponent`, per "Resolved design decisions." This feature adds no
  new channel for secret data.
- Actually producing any `G.log` entries — this feature defines and
  consumes the contract; feature 014 (Love Letter's rules engine) is the
  first game to populate it.
- A "who's currently online in chat" presence indicator — the existing
  `/presence` seat-status badges (feature 001) are unaffected and unrelated;
  this feature does not add a parallel presence concept for chat.

# Mission

## What this is

A web platform for organizing and playing board game matches online. Users
create a room, invite others via a private link/code, and play together in
real time. A single user can also play solo by claiming multiple — or all —
seats of a multiplayer game within the same room, using the exact same
multiplayer engine and code path as a normal match.

The platform is built once as a reusable core (lobby, room, matchmaking,
seat management, presence, reconnection) and hosts multiple board games as
independent, pluggable modules. Each game owns its own rules engine and
board UI; the platform owns everything else. Adding a new game should never
require modifying the platform core.

## Stack

React (client), Node.js (server), boardgame.io (game engine/networking).

## Target audience

Small groups of friends or acquaintances (not strangers matchmade
publicly) who want to play board games together online without installing
anything, and without the group needing to coordinate schedules for a full
table — including a single person who wants to run through a multiplayer
game solo by controlling every seat.

## Core value proposition

- Zero-friction entry: no account creation, just a nickname and a shareable
  room link.
- One platform, many games: the lobby/room/seat/reconnection experience is
  identical across every game the platform hosts.
- Solo play is a first-class citizen, not a bolted-on mode: claiming every
  seat in a room is just multiplayer with one participant, so it gets every
  guarantee (validation, persistence, reconnection) multiplayer gets for
  free.
- Low-stakes, drop-in/drop-out friendly: players can disconnect and rejoin
  without losing the match.

## Explicitly out of scope for the MVP

- Real accounts, login, or OAuth — identity is a nickname + client-side
  session only.
- Cross-device reconnection (resuming a seat from a different device/browser
  than the one that claimed it).
- Spectator chat or any chat system.
- Ranking, ELO, stats tracking, or leaderboards.
- Public matchmaking or a public room directory/browser — rooms are joined
  only via a private invite code.
- More than two room roles (host, member) — no moderators, no
  fine-grained per-action custom roles.
- Mobile native apps — web only, responsive is a nice-to-have, not a
  requirement.
- Any game whose core mechanic depends on symmetric-fairness, real-time
  reflex racing (see tech-stack.md for why this is a genuine engine
  limitation, not just an MVP cut).

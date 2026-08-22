# Feature 042 — Magaluf: cards become printed objects

## Description

Magaluf is meant to end up as a physical deck, and its cards were not shaped
like cards. Each one was a single fused sentence —

> Ligue de piscina — algo es algo. +2 PV.

— carrying a title, a joke and a rules effect in one string, with no picture
and no way to tell one copy from another.

A card is now four things in a fixed order:

| Part | Shared by every copy? |
|---|---|
| **Title**, bold | yes |
| **Image** | no |
| **Effect**, with its numbers coloured | yes |
| **Flavour**, italic | no |

The first and third are what make two cards the *same card*. The second and
fourth are what make them different objects — the model Exploding Kittens uses,
where five Nopes are five different pictures and five different jokes over one
rule.

## The deck holds printed cards

`buildDeck` emits `CardInstance = { id, variant }` rather than bare ids, and
the deck, both discards, `lastDraw`, its `pours` and every draw carry that
instance through.

The alternative was to roll for artwork when a card is drawn, which is far
cheaper and quietly wrong: a phase could show the same picture twice and never
show the third, and a card that went to the discard would come back from the
reshuffle wearing a different face. A printed card has one face for the whole
weekend.

`variant` is 0-based and assigned per copy, so a deck holding three of
something uses 0, 1 and 2. The catalogue therefore owes each card at least as
many flavour lines as the **largest count any one phase deck asks for** — that
is how many copies a table can meet in a single venue. A Cubata appears seven
times in the Noche; it has seven lines.

## Where the effect's numbers come from

The effect is an authored sentence with the numbers interpolated from
`cards.ts` and each one wrapped in a colour tag:

```
"Ganas <vp>{{vp}} PV</vp> y <intox>{{intox}} de Intoxicación</intox>."
```

Rendered with `Trans`, exactly as Cahoots' `GoalCard` already renders its goal
descriptions. `constants.ts` argues that keeping a card's numbers on the card
is what stops the effect and its translated text drifting apart; a sentence
that spells out its own "+2" breaks that the first time a value is tuned, and
breaks it silently, in one language at a time.

Colour follows what the number does to you rather than where it sits in the
sentence — the rule `CardTile` already used. `<intox>` is therefore not a fixed
colour: Agua is the one card whose intoxication goes the good way and it has to
read that way.

## Artwork

`/cards/magaluf/<cardId><NN>.png`, 1-based and zero-padded: `ligueTardeo01.png`,
`cubata07.png`.

Named from the **id**, not the title. The picture is shared by every language
and the titles are not, so a title-derived name would need a hand-maintained
map pinned to one language and would break the first time a title was reworded.

No artwork ships. `CardArt` renders an `<img>` and falls back on `error` to a
placeholder naming the file it wanted, so art can land one card at a time and
appear on the next reload with no code change. The placeholder prints the
filename only — the title is already directly above it, and until artwork
exists every card on the board is in this state.

## Where the full card appears

The drawn pair — the alcohol and its event — render as full cards. The
knock-on drinks a Ronda pours stay compact `CardTile`s: at ten seats a Ronda
would otherwise deal ten pieces of artwork underneath the one card that caused
them. `CardTile` survives for exactly that job and now reads `.title`.

## Content

161 flavour lines per language, 42 event titles and effects, 20 alcohol titles,
one shared alcohol effect sentence. Written in Spanish first — it is the voice
the game is written in — and then in English, translated for tone rather than
word for word.

Note for the record: the option approved for this quoted "~89 flavours per
language", which counted events only. Alcohol adds 72 more, because deck counts
for drinks run much higher than for events. Same job, 80% larger.

The existing fused strings were the source: each split into title, effect and
its first flavour line, so nothing that was already written was thrown away.

## Non-goals

- **Shipping artwork.** Placeholders name their file and get out of the way.
- **Flavour for event *options*.** `magaluf.eventOption.*` stays a plain label
  per branch. The options are buttons, not cards.
- **Full cards for poured drinks.** See above.
- **Retiring `CardTile`.** It is the compact form, and still the right one for
  a list of who drank what.

## Acceptance criteria

- AC1 — A deck holds `{ id, variant }`, with copies of one card numbered from
  zero, and the drawn instance reaches `lastDraw`.
- AC2 — `cardArt(id, variant)` is 1-based and zero-padded.
- AC3 — A card renders title, image, effect and flavour, in that order.
- AC4 — Two copies of one card share title and effect and differ in flavour and
  image.
- AC5 — Effect numbers come from `cards.ts`, signed, and are coloured by what
  they do to the player.
- AC6 — A missing image falls back to a placeholder naming the file.
- AC7 — A copy with no flavour line of its own falls back to the first
  printing rather than printing a raw key.
- AC8 — Every card carries a title, an effect, and at least as many flavour
  lines as the largest phase-deck count, in both languages.

## Verification

862 tests in `game-core` (851 before), 259 client, 24 shared; `typecheck`
clean. `lint` reports 14 problems against a 13 baseline — the extra one is
`dayMultiplier` unused in `PhaseHeader.tsx`, which is on `main`, in a file this
feature does not touch, left over from the board change that removed the
multiplier chip.

Seven mutations, seven caught: variants collapsed to zero, art numbering made
0-based, flavour and art pinned to the first printing, effect numbers replaced
with constants, intox colour frozen, and one card's flavour list truncated
below its deck count. That last one is the guard the whole catalogue rests on —
without it a missing line reaches the table as a raw i18n key.

Checked in the running app across a full Tardeo: **42 distinct printings**
reached the table, each with its own file and its own line —
`tinto01.png` / *"Vino con gaseosa. No engaña a nadie."* alongside
`tinto02.png` / *"Lo que pides cuando no quieres pedir cerveza."*, and
`vino04.png` for the fourth wine. The effect line rendered as
`Ganas <span class="vp">+2 PV</span> y <span class="intoxUp">+1 de
Intoxicación</span>.`, title at weight 700, flavour in italic. No new console
errors; no horizontal overflow.

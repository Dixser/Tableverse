/**
 * Event resolution.
 *
 * Most events are pure data — their numbers live on the card in `cards.ts`
 * and are applied generically. Only events with genuinely structural
 * behaviour (forced drinks, the police, the ambulance, anything that
 * retargets away from the drawing player) need a case of their own.
 *
 * Both police events deliberately reach only seats that are still
 * **partying**. A player who has gone home is not raided — which also closes
 * a loophole: otherwise you could hold contraband, withdraw early, and hope a
 * Redada banked your VP and cancelled your limit check for free.
 *
 * The two catch-up events are the deliberate opposite: they reach every seat
 * still in the running, room or no room, because the player they exist for is
 * typically the one sitting out a phase. See `standings`.
 */

import type { EventEffects, EventId, EventOption } from './cards.js';
import { EVENTS, eventOptions } from './cards.js';
import { COMEBACK } from './constants.js';
import type { Rng } from './rng.js';
import { dayMultipliers } from './settings.js';
import type { MagalufG } from './state.js';
import {
  addIntox,
  addResaca,
  alive,
  arrest,
  bankVP,
  drawAlcohol,
  drunkestSeat,
  dropContraband,
  gainVP,
  hasContraband,
  leavePhase,
  log,
  logOutcome,
  partying,
  pourDrink,
  rankingParams,
  rankSeats,
} from './state.js';

/**
 * The match standings, highest first: banked plus what is still on the table.
 *
 * Banked alone would be the wrong number to rank on — a player halfway through
 * a huge night has not banked any of it yet and would read as destitute — and
 * at-risk alone forgets the whole weekend so far. What a seat is worth right
 * now is both, which is also what the board already shows on every panel.
 *
 * Ranked over `alive`, not `partying`: this is a fact about the match, and the
 * player it usually concerns is the one who is not in the room.
 */
function standings(G: MagalufG): { seatID: string; value: number }[] {
  return rankSeats(G, (p) => p.bankedVP + p.roundVP, alive(G));
}

/**
 * Everyone tied at the bottom of a ranking.
 *
 * Shared rather than picking one name, for the reason Rey del guiri's rework
 * recorded: `rankSeats` settles a tie by seat number, so taking the last entry
 * would quietly decide a payout by where somebody is sitting.
 */
function lastPlace(
  ranked: { seatID: string; value: number }[],
): { seatID: string; value: number }[] {
  const bottom = ranked[ranked.length - 1]?.value;
  return bottom === undefined ? [] : ranked.filter((r) => r.value === bottom);
}

/**
 * Applies one card — or one branch of one — to the drawing player.
 *
 * Takes `EventEffects` rather than an `EventCard` so a choice branch runs down
 * exactly the same path as a plain card. The structural flags at the bottom
 * only ever appear on a branch, but they live here rather than in a second
 * function because "what this does to you" should be one list.
 */
function applyCardEffects(
  G: MagalufG,
  seatID: string,
  effects: EventEffects,
  rng: Rng,
): void {
  const player = G.players[seatID]!;
  if (effects.vp) gainVP(player, effects.vp);
  if (effects.vpAll) for (const id of partying(G)) gainVP(G.players[id]!, effects.vpAll);
  if (effects.intox) addIntox(player, effects.intox);
  if (effects.relief) addIntox(player, -effects.relief);
  if (effects.resaca) addResaca(player, effects.resaca);
  if (effects.losesItems) player.items = [];
  if (effects.givesItem) {
    player.items.push(effects.givesItem);
    log(
      G,
      'gotItem',
      { actor: seatID, descriptionKey: `magaluf.item.${effects.givesItem}` },
      'success',
    );
  }

  // Arm before pouring, so consumeAlcohol's existing Pastis path does the
  // doubling. There is no second "double this drink" rule in the game.
  if (effects.doubles) player.pastisArmed = true;
  if (effects.extraDrink) {
    // drawAlcohol + pourDrink, the same pair Ronda and Chupito de la casa use.
    // Deliberately NOT takeDrink: that would draw another event, and an event
    // that draws an event chains without a fixed point.
    const drink = drawAlcohol(G, rng);
    if (drink) pourDrink(G, seatID, drink);
  }
  if (effects.skips) player.skipNextTurn = true;
  // 'bouncer' rather than a new reason: you chose to go, but it is not a
  // withdrawal, so the Aguafiestas penalty must not apply. The existing reason
  // already means exactly "left the phase, nobody's fault".
  if (effects.leaves && player.status === 'partying') leavePhase(G, seatID, 'bouncer');
}

/** Resolves the branch a player picked on a choice card. */
export function resolveEventOption(
  G: MagalufG,
  seatID: string,
  option: EventOption,
  rng: Rng,
): void {
  log(G, 'choseOption', {
    actor: seatID,
    descriptionKey: `magaluf.eventOption.${option.id}`,
  }, 'play');
  applyCardEffects(G, seatID, option, rng);
}

export { eventOptions };

/**
 * Resolves a card that simply happens to you.
 *
 * A card with `options` never reaches here — `revealPendingEvent` parks it in
 * `G.pendingChoice` instead and `resolveEventOption` finishes the job once the
 * player has picked. The guard is belt-and-braces: silently applying a choice
 * card's (empty) top-level effects would make it look like a Nada.
 */
export function resolveEvent(G: MagalufG, seatID: string, eventId: EventId, rng: Rng): void {
  const card = EVENTS[eventId];
  const player = G.players[seatID]!;
  log(G, 'event', { actor: seatID, descriptionKey: `magaluf.event.${eventId}` });

  if (card.options) return;

  switch (eventId) {
    // --- Retargeted away from the drawing player -------------------------
    // Each of these four is printed as a rule rather than a number, so each
    // reports what the rule actually came to — see `logOutcome`.
    case 'karaoke': {
      // Joint-drunkest counts. `drunkestSeat` answers with a single name and
      // settles a tie by seat order, which quietly withheld the double from a
      // drawer who was level with the worst state at the table -- the same
      // positional rule Rey del guiri was reworked to remove, one card over.
      // The Ambulancia keeps that helper: it removes exactly one player from
      // the phase, so it has no way to honour a tie.
      const most = rankSeats(G, (p) => p.intox, partying(G))[0]?.value ?? 0;
      const doubled = most > 0 && player.intox === most;
      const vp = doubled ? (card.vp ?? 0) * 2 : (card.vp ?? 0);
      gainVP(player, vp);
      logOutcome(
        G,
        doubled ? 'karaokeDrunkest' : 'karaokeResult',
        { actor: seatID, vp },
        'success',
      );
      break;
    }

    // --- Catch-up --------------------------------------------------------
    // Both read `standings`, which ranks everyone still in the running rather
    // than everyone still in the room: the seat these cards exist for is
    // usually the one that is not in the room. Both pay into the bank, because
    // `resolveNight` throws away the round pool of anyone in a cell.

    case 'colecta': {
      const ranked = standings(G);
      const trailing = lastPlace(ranked);
      if (trailing.length === 0) break;
      for (const { seatID: id } of trailing) bankVP(G.players[id]!, card.vp ?? 0);
      logOutcome(
        G,
        'colectaResult',
        { winners: trailing.map((r) => r.seatID).join(','), vp: card.vp ?? 0 },
        'success',
      );
      break;
    }

    case 'remontada': {
      const ranked = standings(G);
      const trailing = lastPlace(ranked);
      const leader = ranked[0]?.value ?? 0;
      const gap = leader - (trailing[0]?.value ?? 0);
      const vp = Math.min(Math.floor(gap / COMEBACK.gapDivisor), COMEBACK.maxVP);
      if (vp <= 0) {
        // A level table has nothing to hand back, and a card that silently did
        // nothing would read as a bug rather than as a compliment.
        logOutcome(G, 'remontadaNobody');
        break;
      }
      for (const { seatID: id } of trailing) bankVP(G.players[id]!, vp);
      // Two entries, the same split Rey del guiri used: the result is short
      // enough to sit under a tile, and the standings are a second line only
      // the feed renders -- which here is also the card showing its working,
      // since the payout is derived from exactly that table.
      logOutcome(
        G,
        'remontadaResult',
        { winners: trailing.map((r) => r.seatID).join(','), n: gap, vp },
        'success',
      );
      log(G, 'remontadaRanking', rankingParams(ranked));
      break;
    }

    case 'barraLibre': {
      const vp = player.drinksThisPhase;
      gainVP(player, vp);
      logOutcome(G, 'barraLibreResult', { actor: seatID, vp, n: vp }, 'success');
      break;
    }

    case 'ambulancia': {
      const victimID = drunkestSeat(G);
      if (victimID) {
        const victim = G.players[victimID]!;
        // Read before the relief lands: the number that got them picked is the
        // one they were carrying, not the one they leave with.
        const intox = victim.intox;
        addIntox(victim, -(card.relief ?? 0));
        addResaca(victim, card.resaca ?? 0);
        logOutcome(G, 'ambulanciaResult', { actor: victimID, n: intox }, 'failure');
        leavePhase(G, victimID, 'ambulance');
      }
      break;
    }

    // --- Structural ------------------------------------------------------
    case 'perdido':
      player.skipNextTurn = true;
      break;

    case 'gorila':
      // Thrown out rather than choosing to leave, so no aguafiestas penalty.
      leavePhase(G, seatID, 'bouncer');
      break;

    case 'chupitoCasa': {
      const drink = drawAlcohol(G, rng);
      if (drink) pourDrink(G, seatID, drink);
      break;
    }

    case 'ronda': {
      for (const id of partying(G)) {
        const drink = drawAlcohol(G, rng);
        if (!drink) break;
        pourDrink(G, id, drink);
      }
      break;
    }

    case 'cacheo': {
      for (const id of partying(G)) {
        const target = G.players[id]!;
        if (!hasContraband(target)) continue;
        dropContraband(target);
        gainVP(target, card.vp ?? 0);
        log(G, 'searched', { actor: id }, 'failure');
      }
      break;
    }

    case 'redada': {
      const caught = partying(G).filter((id) => hasContraband(G.players[id]!));
      if (caught.length === 0) break;
      const multiplier = dayMultipliers(G.settings)[G.day] ?? 1;
      for (const id of caught) {
        dropContraband(G.players[id]!);
        arrest(G, id, multiplier);
      }
      break;
    }

    // --- Everything else is pure data ------------------------------------
    default:
      applyCardEffects(G, seatID, card, rng);
  }
}


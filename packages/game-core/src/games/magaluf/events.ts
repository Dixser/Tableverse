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
 */

import type { EventEffects, EventId, EventOption } from './cards.js';
import { EVENTS, eventOptions } from './cards.js';
import type { Rng } from './rng.js';
import { dayMultipliers } from './settings.js';
import type { MagalufG } from './state.js';
import {
  addIntox,
  addResaca,
  arrest,
  consumeAlcohol,
  drawAlcohol,
  drunkestSeat,
  dropContraband,
  gainVP,
  hasContraband,
  leavePhase,
  log,
  logOutcome,
  partying,
  rankingParams,
  rankSeats,
} from './state.js';

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
    // drawAlcohol + consumeAlcohol directly, the same pair Ronda and Chupito
    // de la casa use. Deliberately NOT takeDrink: that would draw another
    // event, and an event that draws an event chains without a fixed point.
    const drink = drawAlcohol(G, rng);
    if (drink) consumeAlcohol(G, seatID, drink);
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
      const top = drunkestSeat(G);
      const doubled = top === seatID;
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

    case 'reyGuiri': {
      const ranked = rankSeats(G, (p) => p.drinksThisPhase);
      const most = ranked[0]?.value ?? 0;
      if (most > 0) {
        const winners = ranked.filter((r) => r.value === most);
        for (const { seatID: id } of winners) gainVP(G.players[id]!, card.vp ?? 0);
        // Two entries, not one. The result is what the card shows -- short
        // enough to sit under a tile -- and the standings are a second line
        // that only the feed renders, where there is room for the whole table
        // and somewhere to scroll back to it.
        logOutcome(
          G,
          'reyGuiriResult',
          { winners: winners.map((w) => w.seatID).join(','), n: most, vp: card.vp ?? 0 },
          'success',
        );
        log(G, 'reyGuiriRanking', rankingParams(ranked));
      } else {
        // Nobody has drunk anything yet, so there is no king. Worth saying:
        // otherwise the card looks like it failed to resolve.
        logOutcome(G, 'reyGuiriNobody');
      }
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
      if (drink) consumeAlcohol(G, seatID, drink);
      break;
    }

    case 'ronda': {
      for (const id of partying(G)) {
        const drink = drawAlcohol(G, rng);
        if (!drink) break;
        consumeAlcohol(G, id, drink);
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


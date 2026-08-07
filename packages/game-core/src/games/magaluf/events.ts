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

import type { EventCard, EventId, ItemId } from './cards.js';
import { CONTRABAND, EVENTS } from './cards.js';
import type { Rng } from './rng.js';
import { dayMultipliers } from './settings.js';
import type { MagalufG } from './state.js';
import {
  addIntox,
  arrest,
  consumeAlcohol,
  drawAlcohol,
  drunkestSeat,
  dropContraband,
  gainVP,
  hasContraband,
  leavePhase,
  log,
  partying,
} from './state.js';

function applyCardEffects(G: MagalufG, seatID: string, card: EventCard): void {
  const player = G.players[seatID]!;
  if (card.vp) gainVP(player, card.vp);
  if (card.vpAll) for (const id of partying(G)) gainVP(G.players[id]!, card.vpAll);
  if (card.intox) addIntox(player, card.intox);
  if (card.relief) addIntox(player, -card.relief);
  if (card.resaca) player.resaca += card.resaca;
  if (card.losesItems) player.items = [];
}

export function resolveEvent(G: MagalufG, seatID: string, eventId: EventId, rng: Rng): void {
  const card = EVENTS[eventId];
  const player = G.players[seatID]!;
  log(G, 'event', { actor: seatID, descriptionKey: `magaluf.event.${eventId}` });

  switch (eventId) {
    // --- Retargeted away from the drawing player -------------------------
    case 'karaoke': {
      const top = drunkestSeat(G);
      gainVP(player, top === seatID ? (card.vp ?? 0) * 2 : (card.vp ?? 0));
      break;
    }

    case 'reyGuiri': {
      const most = Math.max(...G.activeSeatIDs.map((id) => G.players[id]!.drinksThisPhase));
      if (most > 0) {
        for (const id of G.activeSeatIDs) {
          if (G.players[id]!.drinksThisPhase === most) gainVP(G.players[id]!, card.vp ?? 0);
        }
      }
      break;
    }

    case 'barraLibre':
      gainVP(player, player.drinksThisPhase);
      break;

    case 'ambulancia': {
      const victimID = drunkestSeat(G);
      if (victimID) {
        const victim = G.players[victimID]!;
        addIntox(victim, -(card.relief ?? 0));
        victim.resaca += card.resaca ?? 0;
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

    case 'kebabEvent':
      giveItem(G, seatID, 'kebab');
      break;

    case 'aguaEvent':
      giveItem(G, seatID, 'botella');
      break;

    case 'redbullEvent':
      giveItem(G, seatID, 'redbull');
      break;

    case 'camello': {
      // Random rather than a player choice: choosing needs a pending-decision
      // stage, deferred per spec.md's non-goals.
      giveItem(G, seatID, CONTRABAND[rng.int(CONTRABAND.length)]!);
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
      applyCardEffects(G, seatID, card);
  }
}

function giveItem(G: MagalufG, seatID: string, item: ItemId): void {
  G.players[seatID]!.items.push(item);
  log(G, 'gotItem', { actor: seatID, descriptionKey: `magaluf.item.${item}` }, 'success');
}

/**
 * Event resolution.
 *
 * Most events are now pure data — their numbers live on the card in
 * `cards.ts` and are applied generically below. Only events with genuinely
 * structural behaviour (forced drinks, the police, the ambulance, anything
 * that retargets away from the drawing player) need a case of their own.
 *
 * Kept separate from `engine.ts` and built only on the primitives in
 * `state.ts`, so there is no import cycle.
 *
 * Both police events deliberately only reach players who are still
 * **partying**. A player who has gone home is not raided — which also closes
 * a loophole: otherwise you could hold contraband, withdraw early, and hope a
 * Redada banked your VP and cancelled your limit check for free.
 */

import type { EventCard, EventId, ItemId } from './cards.ts';
import { EVENTS, ITEMS } from './cards.ts';
import { CAMELLO_POOL } from './config.ts';
import type { Config } from './config.ts';
import type { Random } from './rng.ts';
import type { GameState, PlayerState } from './state.ts';
import {
  addIntox,
  addResaca,
  arrest,
  consumeAlcohol,
  drawAlcohol,
  drunkest,
  gainVP,
  giveItem,
  hasContraband,
  dropContraband,
  leavePhase,
  log,
  partying,
} from './state.ts';

/** Applies a card's data fields to the drawing player. */
function applyCardEffects(state: GameState, player: PlayerState, card: EventCard): void {
  if (card.vp) gainVP(player, card.vp);
  if (card.vpAll) for (const p of partying(state)) gainVP(p, card.vpAll);
  if (card.intox) addIntox(player, card.intox);
  if (card.relief) addIntox(player, -card.relief);
  if (card.resaca) addResaca(player, card.resaca);
  if (card.losesItems) player.items = [];
}

export function resolveEvent(
  state: GameState,
  config: Config,
  rng: Random,
  actor: PlayerState,
  eventId: EventId,
): void {
  const card = EVENTS[eventId];
  log(state, { kind: 'event', player: actor.id, event: eventId });

  switch (eventId) {
    // --- Retargeted away from the drawing player -------------------------
    case 'karaoke': {
      const top = drunkest(state);
      const isDrunkest = top !== null && top.id === actor.id;
      gainVP(actor, isDrunkest ? (card.vp ?? 0) * 2 : (card.vp ?? 0));
      break;
    }

    case 'reyGuiri': {
      const most = Math.max(...state.players.map((p) => p.drinksThisPhase));
      if (most > 0) {
        for (const p of state.players) {
          if (p.drinksThisPhase === most) gainVP(p, card.vp ?? 0);
        }
      }
      break;
    }

    case 'barraLibre':
      gainVP(actor, actor.drinksThisPhase);
      break;

    case 'ambulancia': {
      const victim = drunkest(state);
      if (victim) {
        addIntox(victim, -(card.relief ?? 0));
        addResaca(victim, card.resaca ?? 0);
        leavePhase(state, victim, 'ambulance');
      }
      break;
    }

    // --- Structural ------------------------------------------------------
    case 'perdido':
      actor.skipNextTurn = true;
      break;

    case 'gorila':
      // Thrown out rather than choosing to leave, so no aguafiestas penalty.
      leavePhase(state, actor, 'bouncer');
      break;

    case 'chupitoCasa': {
      const drink = drawAlcohol(state, rng);
      if (drink) consumeAlcohol(state, config, actor, drink);
      break;
    }

    case 'ronda': {
      for (const p of partying(state)) {
        const drink = drawAlcohol(state, rng);
        if (!drink) break;
        consumeAlcohol(state, config, p, drink);
      }
      break;
    }

    case 'kebabEvent':
      giveItem(actor, 'kebab');
      break;

    case 'aguaEvent':
      giveItem(actor, 'botella');
      break;

    case 'redbullEvent':
      giveItem(actor, 'redbull');
      break;

    case 'camello': {
      // The prototype hands over a random contraband item rather than offering
      // a choice. A choice needs a pending-decision stage, which is real
      // machinery for a modest balance effect — noted in design.md as a
      // deliberate simplification to revisit in the real module.
      const item = CAMELLO_POOL[rng.int(CAMELLO_POOL.length)]! as ItemId;
      giveItem(actor, item);
      log(state, { kind: 'gotItem', player: actor.id, item });
      break;
    }

    case 'cacheo': {
      for (const p of partying(state)) {
        if (!hasContraband(p)) continue;
        dropContraband(p);
        gainVP(p, card.vp ?? 0);
        log(state, { kind: 'searched', player: p.id });
      }
      break;
    }

    case 'redada': {
      state.stats.redadasDrawn += 1;
      const caught = partying(state).filter(hasContraband);
      if (caught.length === 0) {
        state.stats.redadasThatDidNothing += 1;
        break;
      }
      for (const p of caught) {
        // Recorded before the arrest, while their intoxication still stands:
        // an arrest at this point cancels a limit check they were failing.
        if (state.limit >= 0 && p.intox > state.limit) state.stats.redadaRescues += 1;
        dropContraband(p);
        arrest(state, config, p);
      }
      break;
    }

    // --- Everything else is pure data ------------------------------------
    default:
      applyCardEffects(state, actor, card);
  }
}

/** Whether an item id is contraband — re-exported for bots and UI. */
export function isContraband(item: ItemId): boolean {
  return ITEMS[item].contraband;
}

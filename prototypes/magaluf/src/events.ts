/**
 * Event resolution.
 *
 * Kept separate from `engine.ts` and built only on the primitives in
 * `state.ts`, so there is no import cycle and each event stays a small,
 * readable state mutation.
 *
 * Both police events deliberately only reach players who are still
 * **partying**. A player who has gone home is not raided — which also closes
 * a loophole: otherwise you could hold contraband, withdraw early, and hope a
 * Redada banked your VP and cancelled your limit check for free.
 */

import type { EventId, ItemId } from './cards.ts';
import { ITEMS } from './cards.ts';
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

export function resolveEvent(
  state: GameState,
  config: Config,
  rng: Random,
  actor: PlayerState,
  eventId: EventId,
): void {
  const ev = config.events;
  log(state, { kind: 'event', player: actor.id, event: eventId });

  switch (eventId) {
    case 'ligue':
      gainVP(actor, ev.ligueVP);
      break;

    case 'ligueGrande':
      gainVP(actor, ev.ligueGrandeVP);
      break;

    case 'foto':
      gainVP(actor, ev.fotoVP);
      break;

    case 'soloVoyAMirar':
      gainVP(actor, ev.soloVoyAMirarVP);
      break;

    case 'espuma':
      for (const p of partying(state)) gainVP(p, ev.espumaVP);
      break;

    case 'karaoke': {
      const top = drunkest(state);
      const isDrunkest = top !== null && top.id === actor.id;
      gainVP(actor, isDrunkest ? ev.karaokeDrunkestVP : ev.karaokeVP);
      break;
    }

    case 'barraLibre':
      gainVP(actor, actor.drinksThisPhase);
      break;

    case 'reyGuiri': {
      const most = Math.max(...state.players.map((p) => p.drinksThisPhase));
      if (most > 0) {
        for (const p of state.players) {
          if (p.drinksThisPhase === most) gainVP(p, ev.reyGuiriVP);
        }
      }
      break;
    }

    case 'movilAlMar':
      gainVP(actor, -ev.movilAlMarVP);
      break;

    case 'cartera':
      actor.items = [];
      break;

    case 'perdido':
      actor.skipNextTurn = true;
      break;

    case 'chupitoCasa': {
      const card = drawAlcohol(state, rng);
      if (card) consumeAlcohol(state, config, actor, card);
      break;
    }

    case 'ronda': {
      for (const p of partying(state)) {
        const card = drawAlcohol(state, rng);
        if (!card) break;
        consumeAlcohol(state, config, p, card);
      }
      break;
    }

    case 'garrafonEvent':
      addIntox(actor, ev.garrafonIntox);
      break;

    case 'pelea':
      gainVP(actor, ev.peleaVP);
      addIntox(actor, ev.peleaIntox);
      break;

    case 'vomitona':
      addIntox(actor, -ev.vomitonaRelief);
      addResaca(actor, config.resaca.vomitona);
      break;

    case 'ambulancia': {
      const victim = drunkest(state);
      if (victim) {
        addIntox(victim, -ev.ambulanciaRelief);
        addResaca(victim, config.resaca.ambulancia);
        leavePhase(state, victim, 'ambulance');
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
        gainVP(p, -ev.cacheoVP);
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

    case 'nada':
      break;
  }
}

/** Whether an item id is contraband — re-exported for bots and UI. */
export function isContraband(item: ItemId): boolean {
  return ITEMS[item].contraband;
}

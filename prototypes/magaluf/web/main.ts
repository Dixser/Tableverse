/**
 * Hot-seat prototype UI.
 *
 * Deliberately plain DOM with no framework and no dependencies — this exists to
 * make the design playable, not to prefigure the real board component. The one
 * thing it does take seriously is that no rule lives here: every decision comes
 * from the engine, and this file only draws state and forwards actions.
 */

import { ALCOHOL, EVENTS, ITEMS } from '../src/cards.ts';
import type { Bilingual, ItemId } from '../src/cards.ts';
import { poolChance } from '../src/balconing.ts';
import type { Config } from '../src/config.ts';
import { cloneConfig, defaultConfig } from '../src/config.ts';
import { applyAction, createGame, currentPlayer, legalActions, standings } from '../src/engine.ts';
import type { GameState, LogEntry, PlayerState } from '../src/state.ts';

type Lang = 'es' | 'en';

let lang: Lang = 'es';
let config: Config = cloneConfig(defaultConfig);
let state: GameState;
let shownJumps = 0;
let renderedLog = 0;

// ---------------------------------------------------------------------------
// Strings. Card names come from the card data, never from here.
// ---------------------------------------------------------------------------

const UI: Record<string, Bilingual> = {
  day: { es: 'Día', en: 'Day' },
  phase: { es: 'Fase', en: 'Phase' },
  limit: { es: 'Límite', en: 'Limit' },
  hidden: { es: '???', en: '???' },
  newGame: { es: 'Nueva partida', en: 'New game' },
  log: { es: 'Registro', en: 'Log' },
  tuning: { es: 'Ajustes de balance', en: 'Balance tuning' },
  drink: { es: 'Beber', en: 'Drink' },
  withdraw: { es: 'Retirarse', en: 'Withdraw' },
  use: { es: 'Usar', en: 'Use' },
  turnOf: { es: 'Turno de', en: 'Turn of' },
  banked: { es: 'Banco', en: 'Banked' },
  pending: { es: 'En juego', en: 'At risk' },
  intox: { es: 'Intoxicación', en: 'Intoxication' },
  resaca: { es: 'Resaca', en: 'Hangover' },
  drinks: { es: 'copas', en: 'drinks' },
  drink1: { es: 'copa', en: 'drink' },
  out: { es: 'Fuera', en: 'Out' },
  jail: { es: 'Calabozo', en: 'Jail' },
  dead: { es: 'Muerto', en: 'Dead' },
  risk: { es: 'BALCÓN', en: 'BALCONY' },
  jumpTitle: { es: 'Al balcón', en: 'To the balcony' },
  jumpBody: {
    es: 'está por encima del límite. Solo queda saber si llega a la piscina.',
    en: 'is over the limit. All that is left is whether they reach the pool.',
  },
  jumpBtn: { es: 'Saltar', en: 'Jump' },
  pool: { es: '¡A la piscina!', en: 'Into the pool!' },
  concrete: { es: 'Al cemento.', en: 'Into the concrete.' },
  poolBody: { es: 'Sobrevive. Leyenda de Magaluf', en: 'Survives. Legend of Magaluf' },
  concreteBody: { es: 'Se acabó el fin de semana.', en: 'The weekend is over.' },
  atRisk: { es: 'Se juega en la tirada', en: 'Riding on the roll' },
  lostAll: { es: 'Pierde todos los PV de la noche', en: 'Loses the whole night' },
  bankedNight: { es: 'Guarda la noche', en: 'Banks the night' },
  continue: { es: 'Continuar', en: 'Continue' },
  gameOver: { es: 'Fin de semana terminado', en: 'Weekend over' },
  close: { es: 'Cerrar', en: 'Close' },
  vp: { es: 'PV', en: 'VP' },
  survived: { es: 'noches', en: 'nights' },
};

const DAY_NAMES: Bilingual[] = [
  { es: 'Viernes', en: 'Friday' },
  { es: 'Sábado', en: 'Saturday' },
  { es: 'Domingo', en: 'Sunday' },
];

const PHASE_NAMES: Bilingual[] = [
  { es: 'Tardeo', en: 'Day drinking' },
  { es: 'Noche', en: 'Clubbing' },
  { es: 'After', en: 'Afterparty' },
];

function t(key: string): string {
  return UI[key]?.[lang] ?? key;
}

function name(b: Bilingual): string {
  return b[lang];
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function logLine(entry: LogEntry): { text: string; cls: string } | null {
  const who = entry.player !== undefined ? state.players[entry.player]!.name : '';

  switch (entry.kind) {
    case 'dayStart':
      return { text: `— ${name(DAY_NAMES[entry.n!]!)} —`, cls: 'head' };
    case 'phaseStart':
      return { text: name(PHASE_NAMES[entry.n!]!), cls: 'hl' };
    case 'drank': {
      const card = ALCOHOL[entry.card!]!;
      return { text: `${who}: ${name(card.name)} (+${entry.n} ${lang === 'es' ? 'int' : 'int'}, +${card.vp} ${t('vp')})`, cls: '' };
    }
    case 'event': {
      const ev = EVENTS[entry.event!]!;
      return { text: `${who}: ${name(ev.name)} — ${name(ev.text)}`, cls: 'hl' };
    }
    case 'usedItem':
      return { text: `${who}: ${t('use')} ${name(ITEMS[entry.item!]!.name)}`, cls: 'good' };
    case 'gotItem':
      return { text: `${who}: +${name(ITEMS[entry.item!]!.name)}`, cls: 'good' };
    case 'withdrew':
      return { text: `${who}: ${t('withdraw')}`, cls: '' };
    case 'closingTime':
      return { text: `${who}: ${lang === 'es' ? 'cierran el local' : 'closing time'}`, cls: '' };
    case 'ambulance':
      return { text: `${who}: ${lang === 'es' ? 'se lo lleva la ambulancia' : 'taken by ambulance'}`, cls: 'bad' };
    case 'bouncer':
      return { text: `${who}: ${lang === 'es' ? 'le echa el portero' : 'thrown out by the bouncer'}`, cls: 'bad' };
    case 'aguafiestas':
      return { text: `${who}: ${lang === 'es' ? 'aguafiestas' : 'party pooper'} −${entry.n} ${t('vp')}`, cls: 'bad' };
    case 'ultimoEnPie':
      return { text: `${who}: ${lang === 'es' ? 'último en pie' : 'last one standing'} +${entry.n} ${t('vp')}`, cls: 'good' };
    case 'arrested':
      return { text: `${who}: ${lang === 'es' ? 'detenido — banca sus PV' : 'arrested — banks their VP'}`, cls: 'hl' };
    case 'searched':
      return { text: `${who}: ${lang === 'es' ? 'cacheado' : 'searched'}`, cls: 'bad' };
    case 'skipped':
      return { text: `${who}: ${lang === 'es' ? 'se ha perdido' : 'lost, misses a turn'}`, cls: '' };
    case 'survived':
      return { text: `${who}: ${lang === 'es' ? 'sobrevive la noche' : 'survives the night'} +${entry.n} ${t('vp')}`, cls: 'good' };
    case 'sleptInCell':
      return { text: `${who}: ${lang === 'es' ? 'duerme en el calabozo' : 'sleeps it off in a cell'}`, cls: 'hl' };
    case 'piscina':
      return { text: `${who}: ${lang === 'es' ? '¡a la piscina!' : 'into the pool!'} (d=${entry.n})`, cls: 'good' };
    case 'cemento':
      return { text: `${who}: ${lang === 'es' ? 'balconing fatal' : 'fatal balconing'} (d=${entry.n})`, cls: 'bad' };
    case 'weekendOver':
      return { text: `— ${t('gameOver')} —`, cls: 'head' };
    default:
      return null;
  }
}

function renderLog(): void {
  const box = document.getElementById('log')!;
  if (renderedLog > state.log.length) {
    box.innerHTML = '';
    renderedLog = 0;
  }
  for (let i = renderedLog; i < state.log.length; i++) {
    const line = logLine(state.log[i]!);
    if (!line) continue;
    const el = document.createElement('div');
    el.className = line.cls;
    el.textContent = line.text;
    box.appendChild(el);
  }
  renderedLog = state.log.length;
  box.scrollTop = box.scrollHeight;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function balconyRisk(player: PlayerState): number | null {
  if (!state.limitRevealed && !player.peekedLimit) return null;
  const d = player.intox - state.limit;
  return d >= 1 ? poolChance(d, config) : null;
}

function renderPlayer(player: PlayerState): string {
  const active = currentPlayer(state)?.id === player.id;
  const scale = Math.max(state.limit > 0 ? state.limit * 1.25 : 30, player.intox + 2);
  const pctOf = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const known = state.limitRevealed || player.peekedLimit;
  const over = known && player.intox > state.limit;
  const risk = balconyRisk(player);

  const badges: string[] = [];
  if (player.status === 'dead') badges.push(`<span class="badge dead">${t('dead')}</span>`);
  else if (player.status === 'arrested') badges.push(`<span class="badge jail">${t('jail')}</span>`);
  else if (player.status === 'withdrawn') badges.push(`<span class="badge out">${t('out')}</span>`);
  if (risk !== null) {
    badges.push(`<span class="badge risk">${t('risk')} ${Math.round(risk * 100)}%</span>`);
  }

  const items = player.items
    .map((id) => {
      const item = ITEMS[id];
      return `<span class="item ${item.contraband ? 'illegal' : ''}">${name(item.name)}</span>`;
    })
    .join('');

  return `
    <div class="player ${active ? 'active' : ''} ${player.status === 'dead' ? 'dead' : ''}">
      <div class="name">${player.name} ${badges.join(' ')}</div>
      <div class="meter">
        <div class="track">
          <div class="fill ${over ? 'over' : ''}" style="width:${pctOf(player.intox)}"></div>
          ${player.resaca > 0 ? `<div class="resaca" style="width:${pctOf(player.resaca)}"></div>` : ''}
          ${known ? `<div class="limitmark" style="left:${pctOf(state.limit)}"></div>` : ''}
        </div>
        <div class="labels">
          <span>${t('intox')} <b>${player.intox}</b>${player.resaca > 0 ? ` · ${t('resaca')} ${player.resaca}` : ''}</span>
          <span>${player.drinksThisPhase} ${t(player.drinksThisPhase === 1 ? 'drink1' : 'drinks')}</span>
        </div>
      </div>
      <div class="stats">
        <span>${t('banked')} <b>${player.bankedVP}</b></span>
        <span>${t('pending')} <b>${player.roundVP}</b></span>
      </div>
      <div class="items">${items}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function renderActions(): void {
  const bar = document.getElementById('actions')!;
  const player = currentPlayer(state);
  bar.innerHTML = '';

  if (!player) {
    bar.innerHTML = `<span class="who">${t('gameOver')}</span>`;
    return;
  }

  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = `${t('turnOf')} ${player.name}`;
  bar.appendChild(who);

  for (const action of legalActions(state, config)) {
    const btn = document.createElement('button');
    if (action.type === 'drink') {
      btn.textContent = t('drink');
      btn.className = 'primary';
    } else if (action.type === 'withdraw') {
      btn.textContent = t('withdraw');
      btn.className = 'danger';
    } else {
      const item = ITEMS[action.item as ItemId];
      btn.textContent = `${t('use')} ${name(item.name)}`;
    }
    btn.onclick = () => {
      applyAction(state, config, action);
      render();
    };
    bar.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// The jump
// ---------------------------------------------------------------------------

/**
 * The engine has already rolled by the time we get here, but the player has
 * not seen it. Showing the odds first and the outcome second is the whole
 * reason the mechanic exists — a number resolving silently in a log is not a
 * moment.
 */
function showPendingJumps(): boolean {
  if (shownJumps >= state.jumps.length) return false;

  const jump = state.jumps[shownJumps]!;
  const player = state.players[jump.playerId]!;
  const modal = document.getElementById('modal')!;
  const box = document.getElementById('modalBox')!;

  box.innerHTML = `
    <h2>${t('jumpTitle')}</h2>
    <p><strong>${player.name}</strong> ${t('jumpBody')}</p>
    <p>${t('intox')} ${jump.limit + jump.d} / ${t('limit')} ${jump.limit} &nbsp;·&nbsp; d = ${jump.d}</p>
    <div class="odds">${Math.round(poolChance(jump.d, config) * 100)}%</div>
    ${jump.poolVP > 0 ? `<p>${t('atRisk')}: ${jump.poolVP} ${t('vp')}</p>` : ''}
    <button class="primary" id="jumpBtn">${t('jumpBtn')}</button>`;
  modal.classList.add('show');

  document.getElementById('jumpBtn')!.onclick = () => {
    box.innerHTML = `
      <h2>${t('jumpTitle')}</h2>
      <div class="outcome ${jump.survived ? 'pool' : 'concrete'}">
        ${jump.survived ? t('pool') : t('concrete')}
      </div>
      <p><strong>${player.name}</strong> — ${
        jump.survived
          ? `${t('poolBody')} +${jump.legendVP} ${t('vp')}, ${t('resaca')} +${config.balconing.resaca}`
          : t('concreteBody')
      }</p>
      <p>${
        jump.survived
          ? `${t('bankedNight')}: +${jump.bankedVP} ${t('vp')}`
          : `${t('lostAll')}: −${jump.lostVP} ${t('vp')}`
      }</p>
      <button class="primary" id="contBtn">${t('continue')}</button>`;
    document.getElementById('contBtn')!.onclick = () => {
      shownJumps += 1;
      modal.classList.remove('show');
      render();
    };
  };
  return true;
}

function showFinal(): void {
  const modal = document.getElementById('modal')!;
  const box = document.getElementById('modalBox')!;
  const rows = standings(state)
    .map(
      (p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.bankedVP} ${t('vp')}</td>
        <td>${p.status === 'dead' ? t('dead') : `${p.totalIntoxSurvived} ${t('intox').toLowerCase()}`}</td></tr>`,
    )
    .join('');
  box.innerHTML = `
    <h2>${t('gameOver')}</h2>
    <table class="final">${rows}</table>
    <p></p>
    <button class="primary" id="closeBtn">${t('close')}</button>`;
  modal.classList.add('show');
  document.getElementById('closeBtn')!.onclick = () => modal.classList.remove('show');
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const TUNABLE: { path: string; label: Bilingual; step: number }[] = [
  { path: 'balconing.basePoolChance', label: { es: 'Prob. piscina base', en: 'Base pool chance' }, step: 0.02 },
  { path: 'balconing.decay', label: { es: 'Caída por punto', en: 'Decay per point' }, step: 0.01 },
  { path: 'balconing.legendBase', label: { es: 'Bonus leyenda', en: 'Legend base' }, step: 1 },
  { path: 'balconing.resaca', label: { es: 'Resaca del salto', en: 'Jump resaca' }, step: 1 },
  { path: 'resaca.farlopa', label: { es: 'Resaca farlopa', en: 'Cocaine resaca' }, step: 1 },
  { path: 'items.kebabRelief', label: { es: 'Kebab', en: 'Kebab' }, step: 1 },
];

function readPath(obj: unknown, path: string): number {
  let node: unknown = obj;
  for (const key of path.split('.')) node = (node as Record<string, unknown>)?.[key];
  return node as number;
}

function writePath(obj: unknown, path: string, value: number): void {
  const keys = path.split('.');
  let node = obj as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value;
}

/** Shifts every day's limit deck at once, for playtesting the danger level. */
let limitShift = 0;

function setLimitShift(next: number): void {
  const delta = next - limitShift;
  for (const day of Object.keys(config.limitDecks) as (keyof typeof config.limitDecks)[]) {
    config.limitDecks[day] = config.limitDecks[day].map((v) => v + delta);
  }
  limitShift = next;
}

function renderTuning(): void {
  const box = document.getElementById('tuning')!;
  if (box.childElementCount > 0) return;

  // Reveal timing is the design question the whole After phase turns on, so it
  // is a first-class playtest control rather than a code edit.
  const revealRow = document.createElement('label');
  revealRow.innerHTML = `<span>${lang === 'es' ? 'Revelar límite en' : 'Reveal limit at'}</span>`;
  const select = document.createElement('select');
  for (const option of ['tardeo', 'noche', 'after', 'never'] as const) {
    const el = document.createElement('option');
    el.value = option;
    el.textContent = option;
    el.selected = config.limitRevealAt === option;
    select.appendChild(el);
  }
  select.onchange = () => {
    config.limitRevealAt = select.value as Config['limitRevealAt'];
    newGame();
  };
  revealRow.appendChild(select);
  box.appendChild(revealRow);

  const countRow = document.createElement('label');
  countRow.innerHTML = `<span>${lang === 'es' ? 'Jugadores' : 'Players'}</span>`;
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '2';
  countInput.max = '6';
  countInput.value = String(config.playerCount);
  countInput.onchange = () => {
    config.playerCount = Math.min(6, Math.max(2, Number(countInput.value)));
    newGame();
  };
  countRow.appendChild(countInput);
  box.appendChild(countRow);

  const shiftRow = document.createElement('label');
  shiftRow.innerHTML = `<span>${lang === 'es' ? 'Ajuste del límite' : 'Limit shift'}</span>`;
  const shiftInput = document.createElement('input');
  shiftInput.type = 'number';
  shiftInput.step = '1';
  shiftInput.value = String(limitShift);
  shiftInput.onchange = () => {
    setLimitShift(Number(shiftInput.value));
    newGame();
  };
  shiftRow.appendChild(shiftInput);
  box.appendChild(shiftRow);

  for (const knob of TUNABLE) {
    const row = document.createElement('label');
    row.innerHTML = `<span>${name(knob.label)}</span>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(knob.step);
    input.value = String(readPath(config, knob.path));
    input.onchange = () => writePath(config, knob.path, Number(input.value));
    row.appendChild(input);
    box.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  document.getElementById('dayChip')!.innerHTML =
    `${t('day')} <strong>${name(DAY_NAMES[Math.max(0, state.day)]!)}</strong>`;
  document.getElementById('phaseChip')!.innerHTML =
    `${t('phase')} <strong>${name(PHASE_NAMES[state.phase]!)}</strong>`;
  document.getElementById('multChip')!.innerHTML =
    `${t('vp')} <strong>x${config.dayVPMultiplier[Math.max(0, state.day)]}</strong>`;

  const limitBox = document.getElementById('limitBox')!;
  document.getElementById('limitLabel')!.textContent = t('limit');
  if (state.limitRevealed) {
    limitBox.classList.remove('hidden');
    document.getElementById('limitValue')!.textContent = String(state.limit);
  } else {
    limitBox.classList.add('hidden');
    document.getElementById('limitValue')!.textContent = t('hidden');
  }

  document.getElementById('players')!.innerHTML = state.players.map(renderPlayer).join('');
  renderActions();
  renderLog();
  renderTuning();

  if (showPendingJumps()) return;
  if (state.over && !document.getElementById('modal')!.classList.contains('show')) showFinal();
}

const NAMES = ['Dani', 'Nacho', 'Ana', 'Kev', 'Lola', 'Bea'];

function newGame(): void {
  state = createGame(config, Date.now() & 0xffff, NAMES);
  shownJumps = 0;
  renderedLog = 0;
  document.getElementById('log')!.innerHTML = '';
  document.getElementById('modal')!.classList.remove('show');
  render();
}

function applyStaticLabels(): void {
  document.getElementById('newBtn')!.textContent = t('newGame');
  document.getElementById('logTitle')!.textContent = t('log');
  document.getElementById('tuneTitle')!.textContent = t('tuning');
}

document.getElementById('newBtn')!.onclick = newGame;
document.getElementById('langBtn')!.onclick = () => {
  lang = lang === 'es' ? 'en' : 'es';
  applyStaticLabels();
  document.getElementById('log')!.innerHTML = '';
  renderedLog = 0;
  document.getElementById('tuning')!.innerHTML = '';
  render();
};

applyStaticLabels();
newGame();

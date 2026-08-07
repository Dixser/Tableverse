/**
 * Card catalogues. Data only — no rules logic lives here.
 *
 * Every card carries both `es` and `en` names. The engine never reads them;
 * only the UI does. That keeps the eventual i18n extraction mechanical: each
 * `name` pair becomes a `magaluf.*` key in `en.json` / `es.json`, and
 * `localeParity.test.ts` enforces that neither language drifts.
 */

export type PhaseId = 'tardeo' | 'noche' | 'after';
export const PHASE_IDS: readonly PhaseId[] = ['tardeo', 'noche', 'after'];

export type DayId = 'viernes' | 'sabado' | 'domingo';
export const DAY_IDS: readonly DayId[] = ['viernes', 'sabado', 'domingo'];

export interface Bilingual {
  es: string;
  en: string;
}

// ---------------------------------------------------------------------------
// Alcohol
// ---------------------------------------------------------------------------

export interface AlcoholCard {
  id: string;
  name: Bilingual;
  /** Intoxication gained. Agua is negative — it is the only card that sobers. */
  intox: number;
  vp: number;
}

export const ALCOHOL: Record<string, AlcoholCard> = {
  cana: { id: 'cana', name: { es: 'Caña', en: 'Small beer' }, intox: 1, vp: 1 },
  tinto: { id: 'tinto', name: { es: 'Tinto de verano', en: 'Summer red wine' }, intox: 1, vp: 1 },
  clara: { id: 'clara', name: { es: 'Clara', en: 'Shandy' }, intox: 1, vp: 1 },
  pinta: { id: 'pinta', name: { es: 'Pinta', en: 'Pint' }, intox: 2, vp: 2 },
  vino: { id: 'vino', name: { es: 'Copa de vino', en: 'Glass of wine' }, intox: 2, vp: 2 },
  vermut: { id: 'vermut', name: { es: 'Vermut', en: 'Vermouth' }, intox: 2, vp: 2 },
  sangria: { id: 'sangria', name: { es: 'Jarra de sangría', en: 'Sangría pitcher' }, intox: 2, vp: 3 },
  mojito: { id: 'mojito', name: { es: 'Mojito', en: 'Mojito' }, intox: 2, vp: 2 },
  cubata: { id: 'cubata', name: { es: 'Cubata', en: 'Rum & coke' }, intox: 3, vp: 3 },
  chupito: { id: 'chupito', name: { es: 'Chupito', en: 'Shot' }, intox: 3, vp: 2 },
  gintonic: { id: 'gintonic', name: { es: 'Gin-tonic', en: 'Gin and tonic' }, intox: 3, vp: 3 },
  coctel: { id: 'coctel', name: { es: 'Cóctel de la casa', en: 'House cocktail' }, intox: 3, vp: 4 },
  jager: { id: 'jager', name: { es: 'Jägerbomb', en: 'Jägerbomb' }, intox: 4, vp: 4 },
  cargada: { id: 'cargada', name: { es: 'Copa cargada', en: 'Heavy pour' }, intox: 4, vp: 4 },
  // The five After-exclusive spirits carry a deliberately better VP-per-
  // intoxication rate than anything in the earlier decks. Without that edge the
  // Tardeo was the most efficient phase in the game and there was no economic
  // reason to ever walk into the dangerous one.
  hierbas: { id: 'hierbas', name: { es: 'Chupito de hierbas', en: 'Herb shot' }, intox: 4, vp: 6 },
  tequila3: { id: 'tequila3', name: { es: 'Tequila x3', en: 'Triple tequila' }, intox: 5, vp: 7 },
  absenta: { id: 'absenta', name: { es: 'Absenta', en: 'Absinthe' }, intox: 5, vp: 8 },
  garrafon: { id: 'garrafon', name: { es: 'Garrafón', en: 'Bootleg spirits' }, intox: 5, vp: 6 },
  pecera: { id: 'pecera', name: { es: 'Pecera', en: 'Fishbowl' }, intox: 6, vp: 10 },
  agua: { id: 'agua', name: { es: 'Agua', en: 'Water' }, intox: -1, vp: 0 },
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemId = 'kebab' | 'botella' | 'redbull' | 'porro' | 'pastis' | 'farlopa';

export interface ItemCard {
  id: ItemId;
  name: Bilingual;
  /** Contraband is what Cacheo taxes and Redada arrests you for. */
  contraband: boolean;
}

export const ITEMS: Record<ItemId, ItemCard> = {
  kebab: { id: 'kebab', name: { es: 'Kebab', en: 'Kebab' }, contraband: false },
  botella: { id: 'botella', name: { es: 'Botella de agua', en: 'Water bottle' }, contraband: false },
  redbull: { id: 'redbull', name: { es: 'Red Bull', en: 'Red Bull' }, contraband: false },
  porro: { id: 'porro', name: { es: 'Porro', en: 'Joint' }, contraband: true },
  pastis: { id: 'pastis', name: { es: 'Pastis', en: 'MDMA' }, contraband: true },
  farlopa: { id: 'farlopa', name: { es: 'Farlopa', en: 'Cocaine' }, contraband: true },
};

export const CONTRABAND_ITEMS: readonly ItemId[] = ['porro', 'pastis', 'farlopa'];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventId =
  | 'ligue'
  | 'ligueGrande'
  | 'espuma'
  | 'karaoke'
  | 'foto'
  | 'barraLibre'
  | 'reyGuiri'
  | 'soloVoyAMirar'
  | 'movilAlMar'
  | 'cartera'
  | 'perdido'
  | 'chupitoCasa'
  | 'ronda'
  | 'garrafonEvent'
  | 'pelea'
  | 'vomitona'
  | 'ambulancia'
  | 'kebabEvent'
  | 'aguaEvent'
  | 'redbullEvent'
  | 'camello'
  | 'cacheo'
  | 'redada'
  | 'nada';

export interface EventCard {
  id: EventId;
  name: Bilingual;
  text: Bilingual;
}

export const EVENTS: Record<EventId, EventCard> = {
  ligue: {
    id: 'ligue',
    name: { es: 'Ligue', en: 'Hook-up' },
    text: { es: 'Te lías con alguien en la pista. +3 PV.', en: 'You get off with someone on the dancefloor. +3 VP.' },
  },
  ligueGrande: {
    id: 'ligueGrande',
    name: { es: 'Ligue de la noche', en: 'Hook-up of the night' },
    text: { es: 'Ha sido tremendo. +5 PV.', en: 'That was something else. +5 VP.' },
  },
  espuma: {
    id: 'espuma',
    name: { es: 'Fiesta de la espuma', en: 'Foam party' },
    text: { es: '+2 PV para todos los que sigan de fiesta.', en: '+2 VP to everyone still partying.' },
  },
  karaoke: {
    id: 'karaoke',
    name: { es: 'Karaoke', en: 'Karaoke' },
    text: { es: '+2 PV, o +4 si eres el más borracho.', en: '+2 VP, or +4 if you are the most intoxicated.' },
  },
  foto: {
    id: 'foto',
    name: { es: 'Foto para el Insta', en: 'Photo for the feed' },
    text: { es: '+2 PV.', en: '+2 VP.' },
  },
  barraLibre: {
    id: 'barraLibre',
    name: { es: 'Barra libre', en: 'Open bar' },
    text: { es: '+1 PV por cada copa que llevas en esta fase.', en: '+1 VP per drink you have had this phase.' },
  },
  reyGuiri: {
    id: 'reyGuiri',
    name: { es: 'Rey del guiri', en: 'King of the tourists' },
    text: { es: '+3 PV para quien más haya bebido en esta fase.', en: '+3 VP to whoever has drunk most this phase.' },
  },
  soloVoyAMirar: {
    id: 'soloVoyAMirar',
    name: { es: 'Solo voy a mirar', en: 'Just going to look' },
    text: { es: 'Te asomas al balcón un momento. +5 PV.', en: 'You step out onto the balcony for a second. +5 VP.' },
  },
  movilAlMar: {
    id: 'movilAlMar',
    name: { es: 'Se te cae el móvil al mar', en: 'Phone in the sea' },
    text: { es: '−3 PV.', en: '−3 VP.' },
  },
  cartera: {
    id: 'cartera',
    name: { es: 'Te roban la cartera', en: 'Pickpocketed' },
    text: { es: 'Pierdes todos tus objetos.', en: 'You lose all your items.' },
  },
  perdido: {
    id: 'perdido',
    name: { es: 'Te pierdes', en: 'You get lost' },
    text: { es: 'Pierdes tu próximo turno, pero sigues de fiesta.', en: 'You miss your next turn but stay in the party.' },
  },
  chupitoCasa: {
    id: 'chupitoCasa',
    name: { es: 'Chupito de la casa', en: 'House shot' },
    text: { es: 'Invita la casa: roba otra carta de alcohol.', en: 'On the house: draw another alcohol card.' },
  },
  ronda: {
    id: 'ronda',
    name: { es: 'Ronda', en: 'Round of drinks' },
    text: { es: 'Todos los que sigan de fiesta beben una carta de alcohol.', en: 'Everyone still partying drinks an alcohol card.' },
  },
  garrafonEvent: {
    id: 'garrafonEvent',
    name: { es: 'Te dan garrafón', en: 'Served bootleg' },
    text: { es: '+3 de Intoxicación.', en: '+3 Intoxication.' },
  },
  pelea: {
    id: 'pelea',
    name: { es: 'Pelea', en: 'Fight' },
    text: { es: '+4 PV y +2 de Intoxicación.', en: '+4 VP and +2 Intoxication.' },
  },
  // NOTE: these two carry config-driven numbers in their flavour text, which is
  // how they went stale once the values were tuned. In the real module the text
  // becomes a `t()` call with params, so the number can only ever come from one
  // place. Until then they are kept in step with config.ts by hand.
  vomitona: {
    id: 'vomitona',
    name: { es: 'Vomitona', en: 'Puking' },
    text: { es: '−4 de Intoxicación ahora, pero +3 de Resaca para siempre.', en: '−4 Intoxication now, but +3 Resaca permanently.' },
  },
  ambulancia: {
    id: 'ambulancia',
    name: { es: 'Ambulancia', en: 'Ambulance' },
    text: {
      es: 'El más borracho se retira de la fase, −5 de Intoxicación y +4 de Resaca.',
      en: 'The most intoxicated player withdraws, −5 Intoxication and +4 Resaca.',
    },
  },
  kebabEvent: {
    id: 'kebabEvent',
    name: { es: 'Kebab', en: 'Kebab' },
    text: { es: 'Consigues un Kebab.', en: 'You get a Kebab.' },
  },
  aguaEvent: {
    id: 'aguaEvent',
    name: { es: 'Botellín', en: 'Bottle of water' },
    text: { es: 'Consigues una Botella de agua.', en: 'You get a Water bottle.' },
  },
  redbullEvent: {
    id: 'redbullEvent',
    name: { es: 'Red Bull', en: 'Red Bull' },
    text: { es: 'Consigues un Red Bull.', en: 'You get a Red Bull.' },
  },
  camello: {
    id: 'camello',
    name: { es: 'Camello', en: 'Dealer' },
    text: { es: 'Consigues un objeto ilegal.', en: 'You get a contraband item.' },
  },
  cacheo: {
    id: 'cacheo',
    name: { es: 'Cacheo', en: 'Stop-and-search' },
    text: {
      es: 'Todo el que lleve algo ilegal lo tira y pierde 3 PV.',
      en: 'Everyone holding contraband discards it and loses 3 VP.',
    },
  },
  redada: {
    id: 'redada',
    name: { es: 'Redada', en: 'Police raid' },
    text: {
      es: 'Todo el que lleve algo ilegal pasa la noche en el calabozo: banca sus PV y se acabó el día.',
      en: 'Everyone holding contraband spends the night in a cell: banks their VP, day over.',
    },
  },
  nada: {
    id: 'nada',
    name: { es: 'No pasa nada', en: 'Nothing happens' },
    text: { es: 'Sigue la fiesta.', en: 'The party goes on.' },
  },
};

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

/**
 * Events are tiered by phase in the same way the alcohol decks are.
 *
 * Reusing one `ligue` card at +3 VP across all three phases meant a Tardeo
 * draw and an After draw were worth the same, while the Tardeo's cheap drinks
 * bought far more draws per point of capacity — which is half of why the
 * Tardeo was once the most profitable phase in the game. Each tier now has its
 * own cards: the Tardeo's pay little and cost little, the After's pay a lot
 * and can take your whole night with them.
 */
export type EventId =
  // Tardeo tier — mild, cheap, forgiving
  | 'ligueTardeo'
  | 'fiestaTardeo'
  | 'peleaTardeo'
  | 'chungoTardeo'
  | 'insolacion'
  | 'foto'
  // Noche tier — interactive, real teeth
  | 'ligueNoche'
  | 'fiestaNoche'
  | 'peleaNoche'
  | 'chungoNoche'
  | 'gorila'
  | 'garrafonEvent'
  // After tier — the big money and the real damage
  | 'ligueAfter'
  | 'fiestaAfter'
  | 'peleaAfter'
  | 'chungoAfter'
  | 'soloVoyAMirar'
  | 'terraza'
  | 'comaEtilico'
  // Present in more than one tier, at different frequencies
  | 'karaoke'
  | 'barraLibre'
  | 'reyGuiri'
  | 'perdido'
  | 'chupitoCasa'
  | 'ronda'
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
  /** VP to the drawing player. Negative is a loss. */
  vp?: number;
  /** Intoxication to the drawing player. */
  intox?: number;
  /** VP to every player still partying, including the drawer. */
  vpAll?: number;
  /** Permanent Resaca inflicted on the drawing player. */
  resaca?: number;
  /** Intoxication removed before Resaca is applied. */
  relief?: number;
  /** The drawing player loses every item they hold. */
  losesItems?: boolean;
}

/**
 * Most events are pure data: the numeric fields are applied generically and
 * only the ones with genuinely structural behaviour (forced drinks, the
 * police, the ambulance) need a handler in `events.ts`.
 *
 * Effect magnitudes live here, next to the alcohol values, rather than in
 * `config.ts`. Keeping a card's numbers on the card is what stops the flavour
 * text and the effect drifting apart, which has already happened once.
 */
export const EVENTS: Record<EventId, EventCard> = {
  // --- Tardeo tier -------------------------------------------------------
  ligueTardeo: {
    id: 'ligueTardeo',
    name: { es: 'Ligue de piscina', en: 'Poolside hook-up' },
    text: { es: 'Algo es algo. +2 PV.', en: 'Better than nothing. +2 VP.' },
    vp: 2,
  },
  fiestaTardeo: {
    id: 'fiestaTardeo',
    name: { es: 'Chiringuito', en: 'Beach bar' },
    text: { es: '+1 PV para todos los que sigan de fiesta.', en: '+1 VP to everyone still partying.' },
    vpAll: 1,
  },
  peleaTardeo: {
    id: 'peleaTardeo',
    name: { es: 'Piques de guiris', en: 'Tourist bickering' },
    text: { es: 'Nada serio. +2 PV y +1 de Intoxicación.', en: 'Nothing serious. +2 VP and +1 Intoxication.' },
    vp: 2,
    intox: 1,
  },
  chungoTardeo: {
    id: 'chungoTardeo',
    name: { es: 'Se te cae el móvil al mar', en: 'Phone in the sea' },
    text: { es: '−2 PV.', en: '−2 VP.' },
    vp: -2,
  },
  insolacion: {
    id: 'insolacion',
    name: { es: 'Insolación', en: 'Sunstroke' },
    text: { es: 'Seis horas al sol bebiendo. +2 de Intoxicación.', en: 'Six hours drinking in the sun. +2 Intoxication.' },
    intox: 2,
  },
  foto: {
    id: 'foto',
    name: { es: 'Foto para el Insta', en: 'Photo for the feed' },
    text: { es: '+2 PV.', en: '+2 VP.' },
    vp: 2,
  },

  // --- Noche tier --------------------------------------------------------
  ligueNoche: {
    id: 'ligueNoche',
    name: { es: 'Ligue en la pista', en: 'Dancefloor hook-up' },
    text: { es: '+4 PV.', en: '+4 VP.' },
    vp: 4,
  },
  fiestaNoche: {
    id: 'fiestaNoche',
    name: { es: 'Fiesta de la espuma', en: 'Foam party' },
    text: { es: '+2 PV para todos los que sigan de fiesta.', en: '+2 VP to everyone still partying.' },
    vpAll: 2,
  },
  peleaNoche: {
    id: 'peleaNoche',
    name: { es: 'Pelea', en: 'Fight' },
    text: { es: '+4 PV y +2 de Intoxicación.', en: '+4 VP and +2 Intoxication.' },
    vp: 4,
    intox: 2,
  },
  chungoNoche: {
    id: 'chungoNoche',
    name: { es: 'Te roban la cartera', en: 'Pickpocketed' },
    text: { es: 'Pierdes todos tus objetos.', en: 'You lose all your items.' },
    losesItems: true,
  },
  gorila: {
    id: 'gorila',
    name: { es: 'El portero te saca', en: 'Thrown out by the bouncer' },
    text: {
      es: 'Te echan del local: te retiras de la fase, pero sin penalización.',
      en: 'You are thrown out: you leave the phase, but with no penalty.',
    },
  },
  garrafonEvent: {
    id: 'garrafonEvent',
    name: { es: 'Te dan garrafón', en: 'Served bootleg' },
    text: { es: '+3 de Intoxicación.', en: '+3 Intoxication.' },
    intox: 3,
  },

  // --- After tier --------------------------------------------------------
  ligueAfter: {
    id: 'ligueAfter',
    name: { es: 'Ligue del after', en: 'Afterparty hook-up' },
    text: { es: 'Nadie se acordará. +6 PV.', en: 'Nobody will remember. +6 VP.' },
    vp: 6,
  },
  fiestaAfter: {
    id: 'fiestaAfter',
    name: { es: 'Amanecer en la playa', en: 'Sunrise on the beach' },
    text: { es: '+3 PV para todos los que sigan de fiesta.', en: '+3 VP to everyone still partying.' },
    vpAll: 3,
  },
  peleaAfter: {
    id: 'peleaAfter',
    name: { es: 'Pelea con los porteros', en: 'Fight with the bouncers' },
    text: { es: '+6 PV y +3 de Intoxicación.', en: '+6 VP and +3 Intoxication.' },
    vp: 6,
    intox: 3,
  },
  chungoAfter: {
    id: 'chungoAfter',
    name: { es: 'Despiertas sin nada', en: 'You wake up with nothing' },
    text: { es: 'Pierdes todos tus objetos y 4 PV.', en: 'You lose all your items and 4 VP.' },
    vp: -4,
    losesItems: true,
  },
  soloVoyAMirar: {
    id: 'soloVoyAMirar',
    name: { es: 'Solo voy a mirar', en: 'Just going to look' },
    text: { es: 'Te asomas al balcón un momento. +6 PV.', en: 'You step out onto the balcony for a second. +6 VP.' },
    vp: 6,
  },
  terraza: {
    id: 'terraza',
    name: { es: 'La terraza del quinto', en: 'The fifth-floor terrace' },
    text: { es: 'La mejor fiesta del viaje. +8 PV y +3 de Intoxicación.', en: 'The best party of the trip. +8 VP and +3 Intoxication.' },
    vp: 8,
    intox: 3,
  },
  comaEtilico: {
    id: 'comaEtilico',
    name: { es: 'Coma etílico', en: 'Alcohol poisoning' },
    text: { es: '+5 de Intoxicación.', en: '+5 Intoxication.' },
    intox: 5,
  },

  // --- Present in more than one tier --------------------------------------
  karaoke: {
    id: 'karaoke',
    name: { es: 'Karaoke', en: 'Karaoke' },
    text: { es: '+2 PV, o +4 si eres el más borracho.', en: '+2 VP, or +4 if you are the most intoxicated.' },
    vp: 2,
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
    vp: 3,
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
  vomitona: {
    id: 'vomitona',
    name: { es: 'Vomitona', en: 'Puking' },
    text: { es: '−4 de Intoxicación ahora, pero +3 de Resaca para siempre.', en: '−4 Intoxication now, but +3 Resaca permanently.' },
    relief: 4,
    resaca: 3,
  },
  ambulancia: {
    id: 'ambulancia',
    name: { es: 'Ambulancia', en: 'Ambulance' },
    text: {
      es: 'El más borracho se retira de la fase, −5 de Intoxicación y +4 de Resaca.',
      en: 'The most intoxicated player withdraws, −5 Intoxication and +4 Resaca.',
    },
    relief: 5,
    resaca: 4,
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
    vp: -3,
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

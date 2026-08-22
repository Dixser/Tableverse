import type { ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ALCOHOL, EVENTS, type EventId } from './cards.js';
import { CardArt } from './CardArt.js';
import styles from './GameCard.module.css';

export interface GameCardProps {
  kind: 'alcohol' | 'event';
  id: string;
  /** Which printed copy this is. Selects the picture and the flavour line. */
  variant: number;
}

/**
 * Signed, because a card says "+2 PV" and "−2 PV", never "2 PV".
 *
 * A real minus sign rather than a hyphen: these sit next to each other in a
 * column of numbers and a hyphen is visibly shorter.
 */
function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/**
 * The numbers a card's effect sentence can interpolate, pre-signed.
 *
 * Taken from the card data rather than written into the translation, which is
 * the same argument `constants.ts` already makes about keeping a card's
 * numbers on the card: a sentence that spells out its own "+2" drifts the
 * first time the value is tuned, and drifts silently, in one language.
 */
function effectValues(kind: GameCardProps['kind'], id: string): Record<string, string> {
  if (kind === 'alcohol') {
    const card = ALCOHOL[id];
    if (!card) return {};
    return { intox: signed(card.intox), vp: signed(card.vp) };
  }

  const card = EVENTS[id as EventId];
  if (!card) return {};
  const values: Record<string, string> = {};
  if (card.vp !== undefined) values.vp = signed(card.vp);
  if (card.vpAll !== undefined) values.vpAll = signed(card.vpAll);
  if (card.intox !== undefined) values.intox = signed(card.intox);
  if (card.resaca !== undefined) values.resaca = signed(card.resaca);
  if (card.relief !== undefined) values.relief = signed(-card.relief);
  return values;
}

/**
 * Every value a card quotes gets its own colour, by what the number does to
 * you rather than by where it sits in the sentence — the same rule `CardTile`
 * already uses. More intoxication is the thing that kills you; less is relief,
 * which is why `<intox>` is not a fixed colour: Agua is the one card in the
 * deck whose intoxication goes the good way, and it has to read that way.
 */
function effectTags(kind: GameCardProps['kind'], id: string): Record<string, ReactElement> {
  const intox = kind === 'alcohol' ? ALCOHOL[id]?.intox : EVENTS[id as EventId]?.intox;
  return {
    vp: <span className={styles.vp} />,
    vpAll: <span className={styles.vp} />,
    intox: <span className={(intox ?? 0) > 0 ? styles.intoxUp : styles.intoxDown} />,
    relief: <span className={styles.intoxDown} />,
    resaca: <span className={styles.resaca} />,
    item: <span className={styles.item} />,
  };
}

/**
 * One card, laid out the way the printed card is: title, picture, what it
 * does, and the line of colour underneath that has no rules meaning at all.
 *
 * The flavour is indexed by `variant`, which is what makes two copies of the
 * same card two different objects — see `CardInstance`. Title and effect are
 * deliberately *not* indexed: those are what make them the same card.
 */
export function GameCard({ kind, id, variant }: GameCardProps) {
  const { t } = useTranslation();
  const title = t(`magaluf.${kind}.${id}.title`);

  return (
    <article className={styles.card} data-kind={kind} data-testid={`card-${id}`}>
      <h4 className={styles.title} data-testid={`card-title-${id}`}>
        {title}
      </h4>

      <CardArt id={id} variant={variant} title={title} />

      <p className={styles.effect} data-testid={`card-effect-${id}`}>
        <Trans
          i18nKey={`magaluf.${kind}.${id}.effect`}
          values={effectValues(kind, id)}
          components={effectTags(kind, id)}
        />
      </p>

      {/* Empty for a card whose flavour has not been written yet, and empty is
          rendered as nothing rather than as a blank line holding space open. */}
      <FlavorLine kind={kind} id={id} variant={variant} />
    </article>
  );
}

function FlavorLine({ kind, id, variant }: GameCardProps) {
  const { t } = useTranslation();
  // Falls back to the first printing rather than to the raw key: a copy whose
  // own line is missing is a gap in the catalogue, not a broken card, and the
  // table should still read something in the right voice.
  const own = t(`magaluf.${kind}.${id}.flavor.${variant}`, { defaultValue: '' });
  const text = own || t(`magaluf.${kind}.${id}.flavor.0`, { defaultValue: '' });
  if (!text) return null;

  return (
    <p className={styles.flavor} data-testid={`card-flavor-${id}`}>
      {text}
    </p>
  );
}

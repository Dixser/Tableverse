import type { ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Color } from './deck.js';
import type { GoalDefinition } from './goals.js';
import styles from './GoalCard.module.css';

/** Every color mention in a goal's text renders in that color, bold -- so "blue" reads as blue, not as plain text. */
function colorWord(color: Color): ReactElement {
  return <strong className={styles[color]} />;
}

interface DescriptionSpec {
  key: string;
  values?: Record<string, string | number>;
  /** Trans components map -- only set when the translation string has color tags to fill. */
  components?: Record<string, ReactElement>;
}

/**
 * Builds the (i18nKey, values, components) triple `Trans` needs to render a
 * goal's plain-language requirement, covering all 19 kinds from feature
 * 028's catalog. Every color mention -- whether interpolated (`sumColor`'s
 * `{{color}}`) or a fixed word baked into the sentence itself
 * (`greenEqualsRedValue`'s original "green"/"red", before it generalized to
 * `colorSumEquals`) -- gets its own `<colorTag>` in the translation string,
 * matched here to a `colorWord` component so it renders in that literal
 * color, bold.
 */
function descriptionSpec(goal: GoalDefinition, t: TFunction): DescriptionSpec {
  const colorName = (color: Color) => t(`cahoots.colors.${color}`);
  switch (goal.kind) {
    case 'noRepeatedValues':
      return { key: 'cahoots.goal.noRepeatedValues' };
    case 'noRepeatedColors':
      return { key: 'cahoots.goal.noRepeatedColors' };
    case 'noRepeatedValuesAndColors':
      return { key: 'cahoots.goal.noRepeatedValuesAndColors' };
    case 'aboveFour':
      return { key: 'cahoots.goal.aboveFour' };
    case 'belowFour':
      return { key: 'cahoots.goal.belowFour' };
    case 'allOdd':
      return { key: 'cahoots.goal.allOdd' };
    case 'allEven':
      return { key: 'cahoots.goal.allEven' };
    case 'splitParity':
      return { key: 'cahoots.goal.splitParity' };
    case 'straightOfFourAnyOrder':
      return { key: 'cahoots.goal.straightOfFourAnyOrder' };
    case 'straightOfThreeInOrder':
      return { key: 'cahoots.goal.straightOfThreeInOrder' };
    case 'sumAll':
      return { key: 'cahoots.goal.sumAll', values: { sumTarget: goal.target } };
    case 'sumColor':
      return {
        key: 'cahoots.goal.sumColor',
        values: { color: colorName(goal.color), sumTarget: goal.target },
        components: { color: colorWord(goal.color) },
      };
    case 'exactlyThreeColor':
      return {
        key: 'cahoots.goal.exactlyThreeColor',
        values: { color: colorName(goal.color) },
        components: { color: colorWord(goal.color) },
      };
    case 'twoAdjacentColor':
      return {
        key: 'cahoots.goal.twoAdjacentColor',
        values: { color: colorName(goal.color) },
        components: { color: colorWord(goal.color) },
      };
    case 'twoNotAdjacentColor':
      return {
        key: 'cahoots.goal.twoNotAdjacentColor',
        values: { color: colorName(goal.color) },
        components: { color: colorWord(goal.color) },
      };
    case 'twoAlternatedColor':
      return {
        key: 'cahoots.goal.twoAlternatedColor',
        values: { color: colorName(goal.color) },
        components: { color: colorWord(goal.color) },
      };
    case 'colorPairOnly':
      return {
        key: 'cahoots.goal.colorPairOnly',
        values: { colorA: colorName(goal.colors[0]), colorB: colorName(goal.colors[1]) },
        components: { colorA: colorWord(goal.colors[0]), colorB: colorWord(goal.colors[1]) },
      };
    case 'colorSumEquals':
      return {
        key: 'cahoots.goal.colorSumEquals',
        values: { colorA: colorName(goal.colorA), colorB: colorName(goal.colorB) },
        components: { colorA: colorWord(goal.colorA), colorB: colorWord(goal.colorB) },
      };
    case 'colorSumDoubles':
      return {
        key: 'cahoots.goal.colorSumDoubles',
        values: { colorA: colorName(goal.doubleColor), colorB: colorName(goal.halfColor) },
        components: { colorA: colorWord(goal.doubleColor), colorB: colorWord(goal.halfColor) },
      };
  }
}

export interface GoalCardProps {
  goal: GoalDefinition;
}

export function GoalCard({ goal }: GoalCardProps) {
  const { t } = useTranslation();
  const { key, values, components } = descriptionSpec(goal, t);
  return (
    <div className={styles.card}>
      <p className={styles.description}>
        <Trans i18nKey={key} values={values} components={components} />
      </p>
    </div>
  );
}

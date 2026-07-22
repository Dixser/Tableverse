import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TaskOrderRule } from './levels.js';
import styles from './TaskOrderToken.module.css';

export interface TaskOrderTokenProps {
  rule: TaskOrderRule;
}

function tokenContent(rule: TaskOrderRule, t: TFunction): { symbol: string; label: string } {
  if (rule.type === 'position') {
    const symbol = t(`crew.taskOrder.position.${rule.position}`);
    return { symbol, label: t('crew.taskOrder.positionLabel', { position: symbol }) };
  }
  if (rule.type === 'before') {
    return {
      symbol: '>'.repeat(rule.relativeToTaskIndex + 1),
      label: t('crew.taskOrder.beforeLabel', { index: rule.relativeToTaskIndex + 1 }),
    };
  }
  if (rule.type === 'after') {
    return {
      symbol: '<'.repeat(rule.relativeToTaskIndex + 1),
      label: t('crew.taskOrder.afterLabel', { index: rule.relativeToTaskIndex + 1 }),
    };
  }
  return { symbol: 'Ω', label: t('crew.taskOrder.lastLabel') };
}

/**
 * The rulebook's task order token (levels.ts's TaskOrderRule doc comment
 * has the full semantics), rendered above a task's card so its sequencing
 * requirement is visible at a glance. Chevron count for before/after
 * mirrors the physical logbook's own arrow tokens: it's the 1-indexed
 * draft position of the OTHER task this one is relative to (">>" ==
 * "before the 2nd task drafted"), not a count of anything about this
 * task itself. `last` is the logbook's Omega token.
 */
export function TaskOrderToken({ rule }: TaskOrderTokenProps) {
  const { t } = useTranslation();
  const { symbol, label } = tokenContent(rule, t);
  return (
    <span className={styles.token} title={label} aria-label={label}>
      {symbol}
    </span>
  );
}

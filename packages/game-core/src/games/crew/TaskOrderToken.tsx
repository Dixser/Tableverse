import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TaskOrderRule } from './levels.js';
import styles from './TaskOrderToken.module.css';

export interface TaskOrderTokenProps {
  rule: TaskOrderRule;
  /** This task's rank within its before/after chain (see constraints.ts's `taskOrderChevronRank`) -- unused for `position`/`last` tokens, which have their own fixed symbol. */
  chevronRank?: number;
}

function tokenContent(rule: TaskOrderRule, chevronRank: number | undefined, t: TFunction): { symbol: string; label: string } {
  if (rule.type === 'position') {
    const symbol = t(`crew.taskOrder.position.${rule.position}`);
    return { symbol, label: t('crew.taskOrder.positionLabel', { position: symbol }) };
  }
  if (rule.type === 'before') {
    return {
      symbol: '>'.repeat(chevronRank ?? 1),
      label: t('crew.taskOrder.beforeLabel', { index: rule.relativeToTaskIndex + 1 }),
    };
  }
  if (rule.type === 'after') {
    return {
      symbol: '>'.repeat(chevronRank ?? 1),
      label: t('crew.taskOrder.afterLabel', { index: rule.relativeToTaskIndex + 1 }),
    };
  }
  return { symbol: 'Ω', label: t('crew.taskOrder.lastLabel') };
}

/**
 * The rulebook's task order token (levels.ts's TaskOrderRule doc comment
 * has the full semantics), rendered above a task's card so its sequencing
 * requirement is visible at a glance. Chevron count for before/after is
 * always this task's OWN rank in the chain (`chevronRank`, e.g. the first
 * task that must be won shows a single ">"), never a count derived from
 * the other task's draft-order index -- and always the ">" chevron
 * regardless of before/after, matching the physical logbook's tokens
 * (there's no distinct "<" token in the real game). `last` is the
 * logbook's Omega token.
 */
export function TaskOrderToken({ rule, chevronRank }: TaskOrderTokenProps) {
  const { t } = useTranslation();
  const { symbol, label } = tokenContent(rule, chevronRank, t);
  return (
    <span className={styles.token} title={label} aria-label={label}>
      {symbol}
    </span>
  );
}

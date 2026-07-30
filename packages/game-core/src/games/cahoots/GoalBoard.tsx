import { useTranslation } from 'react-i18next';
import type { GoalDefinition } from './goals.js';
import { GoalCard } from './GoalCard.js';
import { DeckStack } from './DeckStack.js';
import styles from './GoalBoard.module.css';

export interface GoalBoardProps {
  activeGoals: GoalDefinition[];
  /** G.goalDeck.length -- the face-down remainder, not counting the 4 activeGoals already shown as their own GoalCards (same split as Regicide's Castle deck vs. its currently-faced enemy). */
  remainingCount: number;
}

/** Fully public information (feature 028's G carries no hidden goal state), so this renders identically for every seat and for spectators. */
export function GoalBoard({ activeGoals, remainingCount }: GoalBoardProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.board} aria-label={t('cahoots.goalBoard.ariaLabel')}>
      <div className={styles.goals}>
        <DeckStack
          count={remainingCount}
          ariaLabel={t('cahoots.goalDeck.ariaLabel', { count: remainingCount })}
          variant="goal"
        />
        {activeGoals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </section>
  );
}

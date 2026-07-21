import { useTranslation } from 'react-i18next';
import type { RoundConfirmState } from '../../roundConfirm.js';
import { enemyAttack, enemyHealth, type Card, type FaceCard } from './deck.js';
import { isSuitImmune } from './gameDef.js';
import { CardTile } from './CardTile.js';
import { DeckStack } from './DeckStack.js';
import { DiscardPileZone } from './DiscardPileZone.js';
import styles from './EnemyPanel.module.css';

export interface EnemyPanelProps {
  /** Null only for the instant between the 12th defeat and match end --
   * GameoverBanner takes over by then, so this panel simply renders
   * nothing enemy-specific for that instant. */
  currentEnemy: FaceCard | null;
  /** 1-indexed position in the 12-card Castle deck (playerView's own
   * `enemyNumber`). */
  enemyNumber: number;
  damageDealt: number;
  /** Raw, immunity-unaware cumulative total -- shown as its own indicator
   * (spec.md AC6). "Damage you'll take" below is NOT derived from this
   * directly -- see effectiveSpadeShieldTotal -- since a Spades enemy's
   * immunity zeroes its effect on the required discard without ever
   * touching this raw number. */
  spadeShieldTotal: number;
  /** Whether a Jester has cancelled currentEnemy's suit immunity this
   * round -- needed alongside spadeShieldTotal/currentEnemy to compute the
   * EFFECTIVE shield for "damage you'll take" (see that value's own
   * comment below); this raw total accumulates even while immune, same as
   * enterStep4's own G.spadeShieldTotal (gameDef.ts). */
  enemyImmunityCancelled: boolean;
  tavernCount: number;
  /** `G.discardPile` -- full contents, not just a size (spec.md's original
   * "discard pile only ever shows a count" decision is superseded here:
   * players asked to see what's actually cycled out, e.g. to reason about
   * what's left in the Tavern deck). The DeckStack count next to it is
   * still shown -- see DiscardPileZone -- this doesn't replace it. */
  discardPile: Card[];
  /** Only used to decide whether to show the "Defeated" badge -- the
   * actual N-of-M/Confirm/force-advance controls are GameMount's generic
   * RoundConfirmBanner's job, same as every other game embedding
   * RoundConfirmG (Love Letter). See plan.md's revised AC9a note. */
  roundConfirm: RoundConfirmState | null;
}

/**
 * The current enemy's stats (AC6) and deck/discard counts (AC9). While a
 * round-defeat confirmation is pending, `currentEnemy`/`damageDealt`/
 * `spadeShieldTotal` simply haven't been reset yet (see gameDef.ts's
 * resolveEnemyDefeat), so the just-defeated enemy's final numbers keep
 * showing here for free (story 6) -- no confirm-specific code needed
 * beyond the "Defeated" badge. The actual wait-for-everyone UI (N of M
 * confirmed, Confirm, force-advance) is intentionally NOT duplicated
 * here; it's GameMount's generic RoundConfirmBanner, unchanged from
 * every other game.
 */
export function EnemyPanel({
  currentEnemy,
  enemyNumber,
  damageDealt,
  spadeShieldTotal,
  enemyImmunityCancelled,
  tavernCount,
  discardPile,
  roundConfirm,
}: EnemyPanelProps) {
  const { t } = useTranslation();

  const attack = currentEnemy ? enemyAttack(currentEnemy) : 0;
  const health = currentEnemy ? enemyHealth(currentEnemy) : 0;
  const remaining = Math.max(0, health - damageDealt);
  // Bug fix: this used to subtract the RAW spadeShieldTotal unconditionally,
  // so a Spades enemy showed a lower "damage you'll take" than what Step 4
  // (enterStep4, gameDef.ts) actually charges once the accumulated shield
  // is zeroed out by suit immunity. isSuitImmune is the exact same check
  // enterStep4 itself uses, so this can't drift out of sync with it again.
  const effectiveSpadeShieldTotal =
    currentEnemy && !isSuitImmune(currentEnemy, 'S', enemyImmunityCancelled) ? spadeShieldTotal : 0;
  const damageYouWillTake = Math.max(0, attack - effectiveSpadeShieldTotal);
  // _castleDeck.length is never exposed directly (playerView only surfaces
  // the derived enemyNumber) -- currentEnemy has already been popped off
  // it, so this is exactly how many still-hidden enemies remain behind it.
  const castleRemaining = Math.max(0, 12 - enemyNumber);

  return (
    <div className={styles.panel} aria-label={t('regicide.enemy.title')}>
      {currentEnemy && (
        <div className={styles.enemy}>
          <div className={styles.mainStats}>
            {roundConfirm && <span className={styles.badge}>{t('regicide.roundConfirm.defeatedBadge')}</span>}
            <DeckStack
              count={castleRemaining}
              ariaLabel={t('regicide.decks.castleCount', { count: castleRemaining })}
              variant="castle"
            />
            <div>
              <CardTile card={currentEnemy} />
              <span>{t('regicide.enemy.health', { remaining, max: health })}</span>
            </div>
          </div>
          <div className={styles.stats}>
            <div className={styles.damageColumn}>
              <span>{t('regicide.enemy.attack', { value: attack })}</span>
              <span> {t('regicide.enemy.shieldTotal', { value: spadeShieldTotal })}</span>
              <span>{t('regicide.enemy.damageYouWillTake', { value: damageYouWillTake })}</span>
            </div>
          </div>
          <div className={styles.suitsRules}>
            <p>{t('regicide.suits.S')} {t('regicide.suitsRules.S')}</p>
            <p>{t('regicide.suits.H')} {t('regicide.suitsRules.H')}</p>
            <p>{t('regicide.suits.D')} {t('regicide.suitsRules.D')}</p>
            <p>{t('regicide.suits.C')} {t('regicide.suitsRules.C')}</p>
          </div>
        </div>
      )}

      <div className={styles.decks}>
        <DeckStack
          count={tavernCount}
          ariaLabel={t('regicide.decks.tavernCount', { count: tavernCount })}
          variant="tavern"
        />
        <div className={styles.discardGroup}>
          <DeckStack
            count={discardPile.length}
            ariaLabel={t('regicide.decks.discardCount', { count: discardPile.length })}
            variant="discard"
          />
          <DiscardPileZone discardPile={discardPile} />
        </div>
      </div>
    </div>
  );
}

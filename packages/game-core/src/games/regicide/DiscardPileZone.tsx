import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import { DeckStack } from './DeckStack.js';
import styles from './DiscardPileZone.module.css';

export interface DiscardPileZoneProps {
  /** `G.discardPile` -- every card discarded so far (defeated non-exact
   * enemies, cards played to defeat/defend that didn't go to the Tavern,
   * etc). Public state, identical for every viewer. Nothing in this game
   * ever reshuffles the discard pile back into the Tavern deck, so this
   * list only ever grows -- being able to see the full contents (not just
   * the count) lets a player reason about what's already cycled out of the
   * remaining Tavern deck. */
  discardPile: Card[];
}

/**
 * The discard pile: its count as a `DeckStack`, and its contents behind a
 * tap on that stack.
 *
 * The contents used to be rendered inline as a wrapping row of compact
 * CardTiles permanently sitting in the board. Because this pile only ever
 * grows -- nothing reshuffles it back into the Tavern deck -- that row
 * reached ten wrapped lines of cards by the late game, and it was the
 * single biggest contributor to the board's scroll height on a phone.
 *
 * So the pile is now a disclosure: pressing the stack toggles a popover of
 * its contents, which is absolutely positioned and conditionally rendered
 * and therefore costs zero layout height either way. Unlike SuitRulesHelp's
 * hover/focus `?` -- a small, glance-at-it target whose content never
 * changes -- this list is something a player reads and scrolls through, so
 * it gets an explicit toggle rather than opening whenever a desktop cursor
 * happens to cross the pile, plus the usual Escape/click-outside exits.
 */
export function DiscardPileZone({ discardPile }: DiscardPileZoneProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listID = `discard-pile-${useId()}`;
  const titleID = `${listID}-title`;

  // Both exits from an open pile. mousedown/touchstart rather than click, so
  // the pile closes on the press that starts an interaction elsewhere on the
  // board instead of lingering over whatever the player is reaching for.
  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: Event) {
      if (!zoneRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Escape from inside the list (a card tile can hold focus) would
      // otherwise drop focus onto <body> and lose the player's place.
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', closeOnOutsidePress);
    document.addEventListener('touchstart', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('touchstart', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.zone} ref={zoneRef}>
      <button
        type="button"
        className={styles.trigger}
        // The stack's own count is decorative (aria-hidden inside DeckStack),
        // so the button has to carry the whole thing itself: which pile, how
        // many cards, and that pressing it reveals them.
        aria-label={t('regicide.discardedCards.toggle', { count: discardPile.length })}
        aria-expanded={open}
        aria-controls={listID}
        data-testid="discard-pile-toggle"
        ref={triggerRef}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <DeckStack
          count={discardPile.length}
          ariaLabel={t('regicide.decks.discardCount', { count: discardPile.length })}
          variant="discard"
        />
      </button>

      {open && (
        <div className={styles.popover} id={listID} role="group" aria-labelledby={titleID}>
          <p className={styles.title} id={titleID}>
            {t('regicide.discardedCards.title')}
          </p>
          <div className={styles.cards}>
            {discardPile.length === 0 && (
              <span className={styles.placeholder}>{t('regicide.discardedCards.empty')}</span>
            )}
            {discardPile.map((card) => (
              <CardTile key={card.id} card={card} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

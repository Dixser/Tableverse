import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { RegicideView } from './gameDef.js';
import { isLegalSelection } from './legalPlay.js';
import { HandView } from './HandView.js';
import { EnemyPanel } from './EnemyPanel.js';
import { PlayedCardsZone } from './PlayedCardsZone.js';
import { PlayerStatusList } from './PlayerStatusList.js';
import { DefendPanel } from './DefendPanel.js';
import { JesterNextPlayerPicker } from './JesterNextPlayerPicker.js';
import { playerLabel } from './playerLabel.js';
import styles from './BoardComponent.module.css';

/**
 * Local, client-only UI state for the Jester's next-player choice -- never
 * written into G, same category as Love Letter's own MoveDraft (see
 * plan.md). `playCards`' `jesterNextPlayerID` param is validated
 * synchronously inside the same atomic move, so the choice must be fully
 * resolved client-side before the move is ever sent -- there is no G
 * state representing "someone is mid-choice" (plan.md's "Jester
 * next-player choice" decision).
 */
type Draft = { step: 'idle' } | { step: 'choosingJesterNext'; jesterCardID: string };

/** Mirrors gameDef.ts's own (unexported) yieldAllowed -- true unless every
 * OTHER active seat's last completed turn was itself a yield. */
function yieldAllowed(G: RegicideView, playerID: string): boolean {
  const others = G.activeSeatIDs.filter((id) => id !== playerID);
  return !others.every((id) => G.lastActionWasYield[id] === true);
}

/**
 * Renders ONLY the Regicide board -- enemy panel, hand counts, own hand
 * with two-step select-then-Play, Yield, the defend-stage discard panel,
 * and the Jester next-player picker. No player list, seat controls,
 * presence, or chat (platform chrome owns those -- AC11, mirrors
 * Tic-Tac-Toe's AC8 / Love Letter's AC10). See
 * spec/features/023-regicide-board.
 */
export const RegicideBoard: React.FC<BoardProps<RegicideView>> = ({
  G,
  ctx,
  moves,
  playerID,
  isActive,
  playerNames,
}) => {
  const { t } = useTranslation();
  const [selectedCardIDs, setSelectedCardIDs] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>({ step: 'idle' });

  // A seat switch (SeatSwitcher) or a fresh turn must never carry over a
  // stale in-progress selection from a different seat/turn.
  useEffect(() => {
    setSelectedCardIDs([]);
    setDraft({ step: 'idle' });
  }, [playerID, ctx.currentPlayer]);

  const ownHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const isDefending = playerID != null && G.pendingDefense !== null && ctx.currentPlayer === playerID;
  const roundConfirmActive = G.roundConfirm !== null;
  const canAct = isActive && !roundConfirmActive && !isDefending && draft.step === 'idle';

  const selectedCards = ownHand.filter((c) => selectedCardIDs.includes(c.id));
  const selectionLegal = isLegalSelection(selectedCards);
  const playDisabled = !canAct || !selectionLegal;
  const canYield = playerID != null && yieldAllowed(G, playerID);
  const yieldDisabled = !canAct || !canYield;

  function toggleCard(cardID: string) {
    setSelectedCardIDs((prev) => (prev.includes(cardID) ? prev.filter((id) => id !== cardID) : [...prev, cardID]));
  }

  function handlePlay() {
    if (playDisabled) return;
    const isJesterPlay = selectedCards.length === 1 && selectedCards[0]!.kind === 'jester';
    if (isJesterPlay) {
      setDraft({ step: 'choosingJesterNext', jesterCardID: selectedCards[0]!.id });
      return;
    }
    moves.playCards?.(selectedCardIDs);
    setSelectedCardIDs([]);
  }

  function handleYield() {
    if (yieldDisabled) return;
    moves.yield?.();
    setSelectedCardIDs([]);
  }

  function handleJesterNext(nextPlayerID: string) {
    if (draft.step !== 'choosingJesterNext') return;
    moves.playCards?.([draft.jesterCardID], { jesterNextPlayerID: nextPlayerID });
    setSelectedCardIDs([]);
    setDraft({ step: 'idle' });
  }

  return (
    <div className={styles.board}>
      <div className={styles.status}>
        <span>{t('regicide.currentTurn', { name: playerLabel(ctx.currentPlayer, playerNames, t) })}</span>
      </div>

      <EnemyPanel
        currentEnemy={G.currentEnemy}
        enemyNumber={G.enemyNumber}
        damageDealt={G.damageDealt}
        spadeShieldTotal={G.spadeShieldTotal}
        enemyImmunityCancelled={G.enemyImmunityCancelled}
        tavernCount={G.tavernCount}
        discardPile={G.discardPile}
        roundConfirm={G.roundConfirm}
      />

      <PlayedCardsZone cardsInPlay={G.cardsInPlay} />

      <PlayerStatusList
        activeSeatIDs={G.activeSeatIDs}
        handCounts={G.handCounts}
        playerID={playerID}
        playerNames={playerNames}
        currentPlayerID={ctx.currentPlayer}
      />

      {playerID != null && isDefending && (
        <DefendPanel
          hand={ownHand}
          requiredTotal={G.pendingDefense!.requiredTotal}
          onDiscard={(cardIDs) => moves.discardCards?.(cardIDs)}
        />
      )}

      {playerID != null && !isDefending && (
        <>
          <HandView
            hand={ownHand}
            selectedCardIds={selectedCardIDs}
            interactive={canAct}
            onCardClicked={toggleCard}
          />
          <div className={styles.actions}>
            <button className={styles.playButton} type="button" disabled={playDisabled} onClick={handlePlay}>
              {t('regicide.playButton')}
            </button>
            <button className={styles.passButton} type="button" disabled={yieldDisabled} onClick={handleYield}>
              {t('regicide.yieldButton')}
            </button>
            {canAct && !canYield && <span className={styles.yieldReason}>{t('regicide.yieldDisabledReason')}</span>}
          </div>
        </>
      )}

      {draft.step === 'choosingJesterNext' && playerID != null && (
        <JesterNextPlayerPicker
          eligiblePlayerIDs={G.activeSeatIDs.filter((id) => id !== playerID)}
          onSelect={handleJesterNext}
          onCancel={() => setDraft({ step: 'idle' })}
          playerNames={playerNames}
        />
      )}
    </div>
  );
};

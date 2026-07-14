import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { CardRank, LoveLetterView } from './gameDef.js';
import { HandView } from './HandView.js';
import { PlayOrDiscardPicker } from './PlayOrDiscardPicker.js';
import { TargetPicker } from './TargetPicker.js';
import { GuardGuessPicker } from './GuardGuessPicker.js';
import { ChancellorPicker } from './ChancellorPicker.js';
import { PlayArea } from './PlayArea.js';
import { RoundWinsTracker } from './RoundWinsTracker.js';
import { PrivateRevealToast } from './PrivateRevealToast.js';
import { playerLabel } from './playerLabel.js';
import { eligibleTargets } from './eligibleTargets.js';
import styles from './BoardComponent.module.css';

/**
 * Every rank whose playCard case ignores the target param entirely when
 * played (Spy, Handmaid, Chancellor, Countess, Princess) -- the complement
 * of gameDef.ts's own TARGETED_RANKS ({1,2,3,5,7}), derived that way (not
 * copied from a hand-picked list) so a future rank added to either set
 * can't silently drift out of sync.
 */
const TARGETED_RANKS = new Set<CardRank>([1, 2, 3, 5, 7]);
const ALL_RANKS: CardRank[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const NO_TARGET_RANKS = new Set<CardRank>(ALL_RANKS.filter((rank) => !TARGETED_RANKS.has(rank)));

/**
 * Local, client-only UI state for the move currently being composed --
 * never written into G, same category as any uncommitted form input. See
 * spec/features/015-loveletter-board/plan.md. Every clicked card enters
 * `choosingPlayOrDiscard` first (house rule: any card may be discarded
 * instead of played, skipping its effect -- see gameDef.ts's playCard
 * `discard` param); only choosing "Play" continues into targeting.
 */
type MoveDraft =
  | { step: 'idle' }
  | { step: 'choosingPlayOrDiscard'; handIndex: number; cardRank: CardRank }
  | { step: 'choosingTarget'; handIndex: number; cardRank: CardRank; eligibleTargets: string[] }
  | { step: 'choosingGuess'; handIndex: number; targetPlayerID: string };

/** Filters a per-seat record down to just the given seat ids, in order. */
function pick<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  return Object.fromEntries(ids.map((id) => [id, record[id]!]));
}

/**
 * Renders ONLY the Love Letter board -- hand, targeting, play areas, round
 * wins, private reveals. No player list, seat controls, presence, or chat
 * (platform chrome owns those; mirrors Tic-Tac-Toe's own chrome/board
 * split, feature 002's AC8). See spec/features/015-loveletter-board.
 */
export const LoveLetterBoard: React.FC<BoardProps<LoveLetterView>> = ({
  G,
  ctx,
  moves,
  playerID,
  isActive,
  playerNames,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<MoveDraft>({ step: 'idle' });

  // G always carries one entry per the match's static maxPlayers seats
  // (see roomService.startMatch), regardless of how many were actually
  // claimed -- playerNames only has entries for claimed seats, so it
  // doubles as the "which seats are real" filter everywhere below. Falls
  // back to every seat in G when playerNames isn't supplied at all (e.g.
  // a caller that hasn't wired the platform's name map through yet).
  const allSeatIDs = Object.keys(G.playedCards);
  const activeSeatIDs = playerNames
    ? allSeatIDs.filter((id) => id in playerNames)
    : allSeatIDs;

  const ownHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const chancellorPending = playerID != null ? (G.chancellorDraw[playerID] ?? []) : [];
  const ownReveals = playerID != null ? (G.privateReveals[playerID] ?? []) : [];

  const activeView = {
    playedCards: pick(G.playedCards, activeSeatIDs),
    eliminated: pick(G.eliminated, activeSeatIDs),
    handmaidProtected: pick(G.handmaidProtected, activeSeatIDs),
  };

  function handleCardClicked(handIndex: number, cardRank: CardRank) {
    setDraft({ step: 'choosingPlayOrDiscard', handIndex, cardRank });
  }

  function handleChooseDiscard() {
    if (draft.step !== 'choosingPlayOrDiscard') return;
    moves.playCard?.(draft.handIndex, { discard: true });
    setDraft({ step: 'idle' });
  }

  function handleChoosePlay() {
    if (draft.step !== 'choosingPlayOrDiscard') return;
    const { handIndex, cardRank } = draft;
    if (NO_TARGET_RANKS.has(cardRank) || playerID == null) {
      moves.playCard?.(handIndex, {});
      setDraft({ step: 'idle' });
      return;
    }
    const targets = eligibleTargets(cardRank, playerID, activeView);
    if (targets.length === 0) {
      moves.playCard?.(handIndex, {}); // no legal target -- plays with no effect (spec.md story 5).
      setDraft({ step: 'idle' });
      return;
    }
    setDraft({ step: 'choosingTarget', handIndex, cardRank, eligibleTargets: targets });
  }

  function handleSelectTarget(targetPlayerID: string) {
    if (draft.step !== 'choosingTarget') return;
    if (draft.cardRank === 1) {
      // Guard -- chain into the rank-guess step instead of playing yet.
      setDraft({ step: 'choosingGuess', handIndex: draft.handIndex, targetPlayerID });
      return;
    }
    moves.playCard?.(draft.handIndex, { target: targetPlayerID });
    setDraft({ step: 'idle' });
  }

  function handleGuess(guessRank: CardRank) {
    if (draft.step !== 'choosingGuess') return;
    moves.playCard?.(draft.handIndex, { target: draft.targetPlayerID, guessRank });
    setDraft({ step: 'idle' });
  }

  function handleCancel() {
    setDraft({ step: 'idle' });
  }

  function handleChancellorKeep(keepIndex: number, returnOrder: number[]) {
    moves.chancellorKeep?.(keepIndex, returnOrder);
  }

  return (
    <div className={styles.board}>
      <div className={styles.status}>
        <span>
          {t('loveLetter.currentTurn', { name: playerLabel(ctx.currentPlayer, playerNames, t) })}
        </span>
        <span>{t('loveLetter.deckCount', { count: G.deckCount })}</span>
      </div>
      <RoundWinsTracker roundWins={pick(G.roundWins, activeSeatIDs)} playerNames={playerNames} />
      <PlayArea
        playedCards={activeView.playedCards}
        eliminated={activeView.eliminated}
        handmaidProtected={activeView.handmaidProtected}
        playerNames={playerNames}
      />
      {playerID != null && (
        <HandView
          hand={ownHand}
          interactive={isActive && draft.step === 'idle' && chancellorPending.length === 0}
          onCardClicked={handleCardClicked}
        />
      )}
      {draft.step === 'choosingPlayOrDiscard' && (
        <PlayOrDiscardPicker
          cardRank={draft.cardRank}
          onPlay={handleChoosePlay}
          onDiscard={handleChooseDiscard}
          onCancel={handleCancel}
        />
      )}
      {draft.step === 'choosingTarget' && playerID != null && (
        <TargetPicker
          eligiblePlayerIDs={draft.eligibleTargets}
          selfID={playerID}
          onSelect={handleSelectTarget}
          onCancel={handleCancel}
          playerNames={playerNames}
        />
      )}
      {draft.step === 'choosingGuess' && (
        <GuardGuessPicker onGuess={handleGuess} onCancel={handleCancel} />
      )}
      {chancellorPending.length > 0 && (
        <ChancellorPicker candidates={chancellorPending} onKeep={handleChancellorKeep} />
      )}
      {/* key={playerID} -- forces a fresh mount (and fresh de-dup state)
          per viewed seat, so SeatSwitcher solo-play never carries one
          seat's already-shown reveal into another seat's view. */}
      <PrivateRevealToast key={playerID} entries={ownReveals} />
    </div>
  );
};

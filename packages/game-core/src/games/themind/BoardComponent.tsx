import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { TheMindView } from './gameDef.js';
import { EmojiCounter } from './EmojiCounter.js';
import { HandView } from './HandView.js';
import { PlayedCardsZone } from './PlayedCardsZone.js';
import { PlayerStatusList } from './PlayerStatusList.js';
import { ShurikenPanel } from './ShurikenPanel.js';
import styles from './BoardComponent.module.css';

/** One rabbit per remaining life -- see EmojiCounter. */
const LIFE_EMOJI = '🐰';
/** One sparkle per available shuriken. */
const STAR_EMOJI = '💫';

/**
 * Renders ONLY the The Mind board -- status, played-cards zones, every
 * seat's hand count, the acting player's own hand, and the shuriken
 * propose/vote panel. No player list, seat controls, presence, or chat
 * (platform chrome owns those -- see tech-stack.md's chrome/board split).
 * See spec/features/016-themind.
 */
export const TheMindBoard: React.FC<BoardProps<TheMindView>> = ({
  G,
  moves,
  playerID,
  isActive,
  playerNames,
}) => {
  const { t } = useTranslation();
  const ownHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const matchOver = G.matchResult !== null;

  return (
    <div className={styles.board}>
      {G.matchResult && (
        <div
          className={G.matchResult === 'won' ? styles.bannerWon : styles.bannerLost}
          role="status"
        >
          {t(G.matchResult === 'won' ? 'theMind.matchWon' : 'theMind.matchLost')}
        </div>
      )}

      <div className={styles.status}>
        <span>{t('theMind.level', { level: G.level, totalLevels: G.totalLevels })}</span>
        <EmojiCounter
          emoji={LIFE_EMOJI}
          count={G.lives}
          ariaLabel={t('theMind.lives', { count: G.lives })}
        />
        <EmojiCounter
          emoji={STAR_EMOJI}
          count={G.stars}
          ariaLabel={t('theMind.stars', { count: G.stars })}
        />
      </div>

      <PlayerStatusList
        activeSeatIDs={G.activeSeatIDs}
        handCounts={G.handCounts}
        playerID={playerID}
        playerNames={playerNames}
      />

      <PlayedCardsZone
        playedCards={G.playedCards}
        activeSeatIDs={G.activeSeatIDs}
        setAsideCards={G.setAsideCards}
        starDiscards={G.starDiscards}
        playerNames={playerNames}
      />

      {playerID != null && (
        <HandView
          hand={ownHand}
          interactive={isActive && !matchOver && G.shurikenVote === null}
          onPlayLowest={() => moves.playCard?.()}
        />
      )}

      {!matchOver && (
        <ShurikenPanel
          stars={G.stars}
          activeSeatIDs={G.activeSeatIDs}
          playerID={playerID}
          vote={G.shurikenVote}
          playerNames={playerNames}
          onPropose={() => moves.proposeShuriken?.()}
          onVote={(agree) => moves.voteShuriken?.(agree)}
          onCancel={() => moves.cancelShurikenVote?.()}
        />
      )}
    </div>
  );
};

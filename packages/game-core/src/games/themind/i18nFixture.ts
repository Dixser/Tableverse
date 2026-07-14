import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- see Love
 * Letter's own i18nFixture.ts for why this exists (game-core has no i18n
 * bootstrap of its own) and why the strings are deliberately distinct from
 * the real en.json copy (a test failure here can't be masked by
 * accidentally matching production text).
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        theMind: {
          level: 'TEST_level {{level}} {{totalLevels}}',
          lives: 'TEST_lives {{count}}',
          stars: 'TEST_stars {{count}}',
          matchWon: 'TEST_match_won',
          matchLost: 'TEST_match_lost',
          hand: {
            ariaLabel: 'TEST_your_hand',
            empty: 'TEST_hand_empty',
          },
          playedCards: {
            title: 'TEST_played_cards',
            empty: 'TEST_played_cards_empty',
          },
          setAsideCards: { title: 'TEST_set_aside_cards' },
          starDiscards: { title: 'TEST_star_discards' },
          playerStatus: {
            title: 'TEST_player_status',
            cardsLeft: 'TEST_cards_left {{count}}',
          },
          shuriken: {
            propose: 'TEST_propose_shuriken {{count}}',
            voteTitle: 'TEST_vote_title',
            voteProposedBy: 'TEST_vote_proposed_by {{proposer}}',
            agree: 'TEST_agree',
            decline: 'TEST_decline',
            cancel: 'TEST_cancel',
            agreed: 'TEST_agreed',
            waiting: 'TEST_waiting',
          },
        },
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

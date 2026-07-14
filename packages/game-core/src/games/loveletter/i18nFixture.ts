import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests. game-core
 * has no i18n bootstrap of its own (packages/client's i18n.ts owns that at
 * real runtime, and every BoardComponent shares that single global
 * instance once bundled together) -- this fixture stands in for it here so
 * tests can assert real `t()`-driven rendering without importing across
 * the package boundary into client's locale files. Deliberately distinct
 * from the real en.json copy (see each string below) so a test failure
 * here can't be masked by accidentally matching production text; the
 * actual translated content is covered separately by
 * packages/client/src/i18n/localeParity.test.ts and manual review.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        loveLetter: {
          cards: {
            0: { name: 'TEST_Spy', text: 'TEST_spy_text' },
            1: { name: 'TEST_Guard', text: 'TEST_guard_text' },
            2: { name: 'TEST_Priest', text: 'TEST_priest_text' },
            3: { name: 'TEST_Baron', text: 'TEST_baron_text' },
            4: { name: 'TEST_Handmaid', text: 'TEST_handmaid_text' },
            5: { name: 'TEST_Prince', text: 'TEST_prince_text' },
            6: { name: 'TEST_Chancellor', text: 'TEST_chancellor_text' },
            7: { name: 'TEST_King', text: 'TEST_king_text' },
            8: { name: 'TEST_Countess', text: 'TEST_countess_text' },
            9: { name: 'TEST_Princess', text: 'TEST_princess_text' },
          },
          countessForced: 'TEST_countess_forced_hint',
          hand: { ariaLabel: 'TEST_your_hand' },
          target: {
            pickTitle: 'TEST_pick_a_target',
            guessTitle: 'TEST_guess_a_rank',
            self: 'TEST_yourself',
            cancel: 'TEST_cancel',
          },
          playOrDiscard: {
            title: 'TEST_play_or_discard',
            play: 'TEST_play',
            discard: 'TEST_discard',
          },
          chancellor: {
            title: 'TEST_choose_a_card_to_keep',
            keep: 'TEST_keep_this_one',
            orderTitle: 'TEST_choose_return_order',
          },
          playArea: {
            title: 'TEST_play_area',
            eliminated: 'TEST_eliminated',
            protected: 'TEST_protected',
          },
          roundWins: { title: 'TEST_round_wins' },
          currentTurn: 'TEST_current_turn {{name}}',
          deckCount: 'TEST_deck_count {{count}}',
          reveal: {
            priestViewed: 'TEST_priest_viewed {{opponent}} {{opponentRank}}',
            baronCompared: 'TEST_baron_compared {{opponent}} {{ownRank}} {{opponentRank}}',
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

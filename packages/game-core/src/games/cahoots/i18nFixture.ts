import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- same
 * convention as regicide's/Love Letter's own `i18nFixture.ts` (game-core has
 * no i18n bootstrap of its own; see their doc comments for the full
 * rationale). Every `cahoots.*` string is TEST_-prefixed so a test failure
 * can't be masked by accidentally matching production copy.
 *
 * `handSort.*` is feature 031's shared namespace, not a `cahoots.*` one --
 * the controls and drag slots are shared across three games (see src/ui/).
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        handSort: {
          groupAriaLabel: 'TEST_arrange_hand',
          byColor: 'TEST_by_color',
          byNumber: 'TEST_by_number',
          reset: 'TEST_dealt_order',
          applied: 'TEST_hand_arranged {{preset}}',
          dragHandleAriaLabel: 'TEST_reorder {{card}}',
          a11y: {
            instructions: 'TEST_drag_instructions',
            picked: 'TEST_picked {{card}}',
            over: 'TEST_over {{target}}',
            dropped: 'TEST_dropped {{card}}_{{target}}',
            cancelled: 'TEST_cancelled',
          },
        },
        cahoots: {
          colors: {
            blue: 'TEST_blue',
            yellow: 'TEST_yellow',
            red: 'TEST_red',
            green: 'TEST_green',
          },
          // Colors above already carry the TEST_ prefix, so this template
          // stays unprefixed to avoid stacking.
          cardLabel: '{{color}} {{number}}',
          hand: { ariaLabel: 'TEST_your_hand' },
          playerStatus: { title: 'TEST_players', cardsLeft: 'TEST_cards_left {{count}}' },
          pile: {
            label: 'TEST_pile {{index}}',
            expand: 'TEST_expand {{cardsCount}}',
            collapse: 'TEST_collapse',
            historyAriaLabel: 'TEST_card_history {{index}}',
          },
          goalBoard: { ariaLabel: 'TEST_goals' },
          goalDeck: { ariaLabel: 'TEST_goal_deck {{count}}' },
          drawPile: { ariaLabel: 'TEST_draw_pile {{count}}' },
          goal: {
            allOdd: 'TEST_all_odd',
            allEven: 'TEST_all_even',
            aboveFour: 'TEST_above_four',
            belowFour: 'TEST_below_four',
            noRepeatedValues: 'TEST_no_repeated_values',
            noRepeatedColors: 'TEST_no_repeated_colors',
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

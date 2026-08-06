import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- same
 * convention as regicide's/Love Letter's own `i18nFixture.ts` (game-core has
 * no i18n bootstrap of its own; see their doc comments for the full
 * rationale). Every `crew.*` string is TEST_-prefixed so a test failure can't
 * be masked by accidentally matching production copy.
 *
 * `crew.suits.*` are the one deliberate exception to prefixing being enough
 * on its own: production renders emoji there, and an emoji makes a useless
 * accessible name to assert on, so the fixture substitutes readable words.
 *
 * `handSort.*` is feature 031's shared namespace, not a `crew.*` one -- the
 * controls and drag slots are shared across three games (see src/ui/).
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        handSort: {
          groupAriaLabel: 'TEST_arrange_hand',
          bySuit: 'TEST_by_suit',
          byRank: 'TEST_by_rank',
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
        crew: {
          suits: {
            pink: 'TEST_pink',
            blue: 'TEST_blue',
            green: 'TEST_green',
            yellow: 'TEST_yellow',
            rocket: 'TEST_rocket',
          },
          // Suits above already carry the TEST_ prefix, so this template stays
          // unprefixed to avoid stacking -- same reasoning as regicide's fixture.
          cardLabel: '{{suit}} {{rank}}',
          cardIllegalReason: 'TEST_card_illegal_reason',
          hand: { ariaLabel: 'TEST_your_hand' },
          commander: 'TEST_commander {{name}}',
          trickProgress: 'TEST_trick_progress {{current}}_{{total}}',
          trick: {
            inProgressTitle: 'TEST_current_trick',
            resolvedTitle: 'TEST_trick_result',
            winner: 'TEST_won_by {{name}}',
          },
          communication: {
            title: 'TEST_radio_communication',
            none: 'TEST_nothing_communicable',
            used: 'TEST_radio_used',
            disrupted: 'TEST_communication_disrupted {{trick}}',
            deadZoneNote: 'TEST_dead_zone_note',
            position: {
              highest: 'TEST_highest',
              only: 'TEST_only',
              lowest: 'TEST_lowest',
            },
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

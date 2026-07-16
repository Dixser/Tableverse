import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- same
 * convention as Love Letter's/The Mind's own `i18nFixture.ts` (game-core
 * has no i18n bootstrap of its own; see their doc comments for the full
 * rationale). Every `regicide.*` string is deliberately TEST_-prefixed so
 * a test failure here can't be masked by accidentally matching production
 * copy. `room.seatLabel` and `roundConfirm.*` are the two exceptions,
 * kept at their real production values on purpose: `room.seatLabel`
 * mirrors Love Letter's own fixture (a shared, simple, already-covered
 * platform string), and `roundConfirm.*` is reused verbatim by
 * EnemyPanel itself (see roundConfirmDisplay.ts's doc comment) rather
 * than reimplemented under a `regicide.*` key, so its test coverage
 * should exercise the same real copy the platform's generic
 * RoundConfirmBanner already uses.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        roundConfirm: {
          title: 'Round complete',
          progress: '{{confirmed}} of {{total}} confirmed',
          confirmButton: 'Ready for next round',
          forceAdvanceButton: 'Skip waiting (host)',
        },
        regicide: {
          suits: {
            S: 'TEST_Spades',
            H: 'TEST_Hearts',
            D: 'TEST_Diamonds',
            C: 'TEST_Clubs',
          },
          faceRanks: {
            J: 'TEST_Jack',
            Q: 'TEST_Queen',
            K: 'TEST_King',
          },
          cardLabel: {
            number: 'TEST_{{rank}}_of_{{suit}}',
            companion: 'TEST_Companion_of_{{suit}}',
            jester: 'TEST_Jester',
            face: 'TEST_{{rank}}_of_{{suit}}',
          },
          cardStats: 'TEST_atk_{{attack}}_hp_{{health}}',
          cardIllegalReason: 'TEST_card_illegal_reason',
          hand: { ariaLabel: 'TEST_your_hand' },
          playButton: 'TEST_Play',
          yieldButton: 'TEST_Yield',
          yieldDisabledReason: 'TEST_yield_disabled_reason',
          discardButton: 'TEST_Discard',
          defend: {
            title: 'TEST_defend_title {{required}}',
            progress: 'TEST_defend_progress {{selected}}_{{required}}',
          },
          enemy: {
            title: 'TEST_current_enemy',
            number: 'TEST_enemy_number {{number}}',
            attack: 'TEST_attack {{value}}',
            health: 'TEST_health {{remaining}}_{{max}}',
            damageDealt: 'TEST_damage_dealt {{value}}',
            shieldTotal: 'TEST_shield_total {{value}}',
            damageYouWillTake: 'TEST_damage_you_will_take {{value}}',
          },
          decks: {
            tavernCount: 'TEST_tavern_count {{count}}',
            discardCount: 'TEST_discard_count {{count}}',
          },
          handCounts: {
            title: 'TEST_hand_counts',
            cardsLeft: 'TEST_cards_left {{count}}',
          },
          jester: { pickTitle: 'TEST_choose_who_goes_next', cancel: 'TEST_cancel' },
          currentTurn: 'TEST_current_turn {{name}}',
          roundConfirm: { defeatedBadge: 'TEST_defeated' },
        },
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

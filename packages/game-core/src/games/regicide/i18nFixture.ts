import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- same
 * convention as Love Letter's/The Mind's own `i18nFixture.ts` (game-core
 * has no i18n bootstrap of its own; see their doc comments for the full
 * rationale). Every `regicide.*` string is deliberately TEST_-prefixed so
 * a test failure here can't be masked by accidentally matching production
 * copy. `room.seatLabel` is the one exception, kept at its real
 * production value on purpose, mirroring Love Letter's own fixture (a
 * shared, simple, already-covered platform string).
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'Seat {{seatNumber}}' },
        regicide: {
          suits: {
            S: 'TEST_S',
            H: 'TEST_H',
            D: 'TEST_D',
            C: 'TEST_C',
          },
          suitsRules: {
            S: 'TEST_suit_rule_S',
            H: 'TEST_suit_rule_H',
            D: 'TEST_suit_rule_D',
            C: 'TEST_suit_rule_C',
          },
          faceRanks: {
            J: 'TEST_J',
            Q: 'TEST_Q',
            K: 'TEST_K',
          },
          cardLabel: {
            // Matches production's "{{suit}} {{rank}}" order -- suits/
            // faceRanks above already carry the TEST_ prefix, so this
            // template stays unprefixed to avoid stacking (e.g. avoiding
            // a confusing "TEST_TEST_S TEST_4"). A companion card reuses
            // this same `number` key (rank hardcoded to "A" by CardTile
            // itself, not translated) -- see CardTile.tsx's own doc
            // comment on ACE_RANK.
            number: '{{suit}} {{rank}}',
            jester: 'TEST_Jester',
            face: '{{suit}} {{rank}}',
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
            shieldTotal: 'TEST_shield_total {{value}}',
            damageYouWillTake: 'TEST_damage_you_will_take {{value}}',
          },
          decks: {
            tavernCount: 'TEST_tavern_count {{count}}',
            discardCount: 'TEST_discard_count {{count}}',
            castleCount: 'TEST_castle_count {{count}}',
          },
          playedCards: {
            title: 'TEST_played_cards_title',
            empty: 'TEST_played_cards_empty',
          },
          discardedCards: {
            title: 'TEST_discarded_cards_title',
            empty: 'TEST_discarded_cards_empty',
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

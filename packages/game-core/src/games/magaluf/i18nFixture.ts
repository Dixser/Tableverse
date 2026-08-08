import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Test-only i18next instance for this folder's component tests -- same
 * convention as cahoots'/regicide's/Love Letter's own `i18nFixture.ts`
 * (game-core has no i18n bootstrap of its own).
 *
 * Every `magaluf.*` string is `TEST_`-prefixed so an assertion can never pass
 * by accidentally matching production copy: if the board stopped calling `t`
 * and hardcoded a Spanish or English label, these tests would fail rather
 * than quietly agreeing with it.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        room: { seatLabel: 'TEST_seat_{{seatNumber}}' },
        magaluf: {
          alcohol: { pinta: 'TEST_pint', cana: 'TEST_small_beer', pecera: 'TEST_fishbowl' },
          event: { foto: 'TEST_photo', redada: 'TEST_raid', terraza: 'TEST_terrace', camelloFarlopa: 'TEST_dealer_coke' },
          item: {
            kebab: 'TEST_kebab',
            botella: 'TEST_water',
            redbull: 'TEST_redbull',
            porro: 'TEST_joint',
            pastis: 'TEST_mdma',
            farlopa: 'TEST_cocaine',
          },
          phase: { tardeo: 'TEST_tardeo', noche: 'TEST_noche', after: 'TEST_after' },
          day: { viernes: 'TEST_friday', sabado: 'TEST_saturday', domingo: 'TEST_sunday' },
          board: {
            drink: 'TEST_drink',
            withdraw: 'TEST_withdraw',
            use: 'TEST_use {{item}}',
            banked: 'TEST_banked',
            atRisk: 'TEST_at_risk',
            intoxication: 'TEST_intoxication',
            resaca: 'TEST_hangover',
            limit: 'TEST_limit',
            limitBetween: 'TEST_limit_between {{min}} {{max}}',
            drinks_one: 'TEST_{{count}}_drink',
            drinks_other: 'TEST_{{count}}_drinks',
            dayMultiplier: 'TEST_multiplier {{multiplier}}',
            you: 'TEST_you {{name}}',
            statusOut: 'TEST_out',
            statusJail: 'TEST_jail',
            statusDead: 'TEST_dead',
            balconyRisk: 'TEST_risk {{percent}}',
            intoxShort: 'TEST_int {{n}}',
            vpShort: 'TEST_vp {{n}}',
            meterAria: 'TEST_meter {{intox}} {{resaca}}',
            nothingDrawn: 'TEST_nothing_drawn',
            drewCaption: 'TEST_drew {{name}}',
            balconyTitle: 'TEST_balcony',
            balconyBody: 'TEST_balcony_body {{name}} {{over}}',
            balconyNumbers: 'TEST_balcony_numbers {{intox}} {{limit}}',
            balconyOdds: 'TEST_odds {{percent}}',
            balconyTarget: 'TEST_target d{{die}} over {{over}}',
            balconyRolled: 'TEST_rolled {{roll}} d{{die}}',
            balconyLost: 'TEST_lost {{vp}}',
            balconyJump: 'TEST_jump',
            balconyPool: 'TEST_pool',
            balconyConcrete: 'TEST_concrete',
            balconyPoolBody: 'TEST_pool_body {{name}} {{vp}}',
            balconyConcreteBody: 'TEST_concrete_body {{name}}',
            balconyContinue: 'TEST_continue',
            balconySkip: 'TEST_skip',
          },
        },
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

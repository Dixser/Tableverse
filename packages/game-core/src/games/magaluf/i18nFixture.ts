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
          // Cards are title / effect / flavour[] now, and the effect carries
          // the colour tags `GameCard` fills in -- so a test can assert that a
          // number is coloured by what it does to you without reaching into
          // production copy. Two flavour lines everywhere, so a test can tell
          // one printing of a card from another.
          alcohol: {
            pinta: {
              title: 'TEST_pint',
              effect: 'TEST_drink <intox>{{intox}}</intox> <vp>{{vp}}</vp>',
              flavor: ['TEST_pint_flavor_a', 'TEST_pint_flavor_b'],
            },
            cana: {
              title: 'TEST_small_beer',
              effect: 'TEST_drink <intox>{{intox}}</intox> <vp>{{vp}}</vp>',
              flavor: ['TEST_cana_flavor_a', 'TEST_cana_flavor_b'],
            },
            pecera: {
              title: 'TEST_fishbowl',
              effect: 'TEST_drink <intox>{{intox}}</intox> <vp>{{vp}}</vp>',
              flavor: ['TEST_pecera_flavor_a'],
            },
            agua: {
              title: 'TEST_water_card',
              effect: 'TEST_drink <intox>{{intox}}</intox> <vp>{{vp}}</vp>',
              flavor: ['TEST_agua_flavor_a'],
            },
          },
          event: {
            foto: {
              title: 'TEST_photo',
              effect: 'TEST_photo_effect <vp>{{vp}}</vp>',
              flavor: ['TEST_photo_flavor_a', 'TEST_photo_flavor_b'],
            },
            redada: {
              title: 'TEST_raid',
              effect: 'TEST_raid_effect',
              flavor: ['TEST_raid_flavor_a'],
            },
            terraza: {
              title: 'TEST_terrace',
              effect: 'TEST_terrace_effect',
              flavor: ['TEST_terrace_flavor_a'],
            },
            camelloFarlopa: {
              title: 'TEST_dealer_coke',
              effect: 'TEST_dealer_effect',
              flavor: ['TEST_dealer_flavor_a'],
            },
            vomitona: {
              title: 'TEST_puke',
              effect: 'TEST_puke_effect',
              flavor: ['TEST_puke_flavor_a'],
            },
            dueloNoche: {
              title: 'TEST_duel_card',
              effect: 'TEST_duel_effect <vp>{{vp}}</vp>',
              flavor: ['TEST_duel_flavor_a', 'TEST_duel_flavor_b'],
            },
          },
          eventOption: {
            vomitar: 'TEST_throw_up',
            aguantar: 'TEST_hold_it_in',
            subirALaTerraza: 'TEST_go_up',
            quedarseAbajo: 'TEST_stay_down',
            pillarFarlopa: 'TEST_take_the_coke',
            dejarlo: 'TEST_leave_it',
            retar: 'TEST_challenge',
          },
          item: {
            kebab: 'TEST_kebab',
            botella: 'TEST_water',
            redbull: 'TEST_redbull',
            porro: 'TEST_joint',
            pastis: 'TEST_mdma',
            farlopa: 'TEST_cocaine',
          },
          itemDesc: {
            kebab: 'TEST_kebab_rules',
            botella: 'TEST_water_rules',
            redbull: 'TEST_redbull_rules',
            porro: 'TEST_joint_rules',
            pastis: 'TEST_mdma_rules',
            farlopa: 'TEST_cocaine_rules',
          },
          itemShort: {
            kebab: 'TEST_kebab_short',
            botella: 'TEST_water_short',
            redbull: 'TEST_redbull_short',
            porro: 'TEST_joint_short',
            pastis: 'TEST_mdma_short',
            farlopa: 'TEST_cocaine_short',
          },
          // Only the outcome keys DrawnCards renders -- the rest of the log is
          // the chat feed's business and has its own tests.
          log: {
            barraLibreResult: 'TEST_open_bar {{actor}} {{n}} {{vp}}',
            remontadaResult: 'TEST_comeback {{winners}} {{n}} {{vp}}',
            duelResult: 'TEST_duel_result {{actor}} {{n}} {{vp}}',
            duelNobody: 'TEST_duel_nobody',
          },
          phase: { tardeo: 'TEST_tardeo', noche: 'TEST_noche', after: 'TEST_after' },
          day: { viernes: 'TEST_friday', sabado: 'TEST_saturday', domingo: 'TEST_sunday' },
          board: {
            drink: 'TEST_drink',
            withdraw: 'TEST_withdraw',
            use: 'TEST_use {{item}}',
            itemEffect: '({{effect}})',
            banked: 'TEST_banked',
            atRisk: 'TEST_at_risk',
            intoxication: 'TEST_intoxication',
            resaca: 'TEST_hangover',
            limit: 'TEST_limit',
            limitBetween: 'TEST_limit_between {{min}} {{max}}',
            cierrabares: 'TEST_cierrabares',
            cierrabaresWon: 'TEST_cierrabares_won {{name}} {{drinks}} {{vp}}',
            drinks_one: 'TEST_{{count}}_drink',
            drinks_other: 'TEST_{{count}}_drinks',
            phaseDrinks: 'TEST_phase_drinks {{min}} {{max}}',
            dayMultiplier: 'TEST_multiplier {{multiplier}}',
            you: 'TEST_you {{name}}',
            statusOut: 'TEST_out',
            statusJail: 'TEST_jail',
            statusDead: 'TEST_dead',
            outside: 'TEST_smoking',
            balconyRisk: 'TEST_risk {{percent}}',
            intoxShort: 'TEST_int {{n}}',
            vpShort: 'TEST_vp {{n}}',
            meterAria: 'TEST_meter {{intox}} {{resaca}}',
            nothingDrawn: 'TEST_nothing_drawn',
            drewCaption: 'TEST_drew {{name}}',
            pouredCaption: 'TEST_poured',
            balconyTitle: 'TEST_balcony',
            balconyBody: 'TEST_balcony_body {{name}} {{over}}',
            balconyNumbers: 'TEST_balcony_numbers {{intox}} {{limit}}',
            balconyOdds: 'TEST_odds {{percent}}',
            balconyTarget: 'TEST_target d{{die}} over {{over}}',
            balconyTargetMax: 'TEST_target_max d{{die}}',
            balconyRolled: 'TEST_rolled {{roll}} d{{die}}',
            balconyAtRisk: 'TEST_at_risk {{vp}}',
            balconyLost: 'TEST_lost {{vp}}',
            balconyBanked: 'TEST_banked {{vp}}',
            balconyJump: 'TEST_jump',
            balconyPool: 'TEST_pool',
            balconyConcrete: 'TEST_concrete',
            balconyPoolBody: 'TEST_pool_body {{name}} {{vp}}',
            balconyConcreteBody: 'TEST_concrete_body {{name}}',
            balconyContinue: 'TEST_continue',
            balconySkip: 'TEST_skip',
            balconyWaitingJump: 'TEST_on_railing {{name}}',
            balconyWaitingContinue: 'TEST_waiting_jumper {{name}}',
            revealEvent: 'TEST_reveal_event',
            eventFaceDown: 'TEST_face_down',
            chooseOption: 'TEST_your_call',
            waitingChoice: 'TEST_deciding {{name}}',
            duelPickTarget: 'TEST_duel_pick',
            duelWaitingTarget: 'TEST_duel_choosing {{name}}',
            duelVs: 'TEST_duel {{challenger}} {{target}}',
            duelPot: 'TEST_pot {{vp}}',
            duelNextPot: 'TEST_next_pot {{vp}}',
            duelDrink: 'TEST_duel_drink',
            duelFold: 'TEST_duel_fold',
            duelWaiting: 'TEST_duel_deciding {{name}}',
          },
        },
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

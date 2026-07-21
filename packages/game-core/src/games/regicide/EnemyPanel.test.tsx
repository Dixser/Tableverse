// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { EnemyPanel } from './EnemyPanel.js';
import type { FaceCard, NumberCard } from './deck.js';

// Deliberately NOT Spades -- the generic AC6 tests below want a plain
// attack-minus-shield formula with no suit-immunity interaction; the
// Spades-immunity interaction itself is covered separately by its own
// `spadeKing` fixture and tests further down (regression coverage for the
// bug where a Spades enemy's immunity wasn't zeroing out the displayed
// "damage you'll take", even though it was correctly zeroed for the
// actual Step 4 discard requirement).
const king: FaceCard = { id: 'DK', kind: 'face', suit: 'D', rank: 'K' }; // attack 20, health 40.
const spadeKing: FaceCard = { id: 'SK', kind: 'face', suit: 'S', rank: 'K' }; // attack 20, health 40.

/**
 * 5 distinct filler cards -- only the count (5) matters to most tests here.
 * Ranks deliberately avoid 5 and 20 -- those collide with the discard
 * DeckStack's own count (5) and the tavern count (20) used throughout this
 * file, which would make a bare `getByText('5')`/`getByText('20')` match
 * more than one element once each card's own rank is also on screen.
 */
const fiveDiscards: NumberCard[] = [
  { id: 'S2', kind: 'number', suit: 'S', rank: 2 },
  { id: 'H3', kind: 'number', suit: 'H', rank: 3 },
  { id: 'D4', kind: 'number', suit: 'D', rank: 4 },
  { id: 'C6', kind: 'number', suit: 'C', rank: 6 },
  { id: 'S7', kind: 'number', suit: 'S', rank: 7 },
];

function renderPanel(overrides: Partial<Parameters<typeof EnemyPanel>[0]> = {}) {
  return render(
    <EnemyPanel
      currentEnemy={king}
      enemyNumber={3}
      damageDealt={10}
      spadeShieldTotal={4}
      enemyImmunityCancelled={false}
      tavernCount={20}
      discardPile={fiveDiscards}
      roundConfirm={null}
      {...overrides}
    />,
  );
}

describe('EnemyPanel', () => {
  it('AC6: renders attack, health (remaining/max, which conveys damage dealt), shield, and damage-you-will-take', () => {
    renderPanel();
    expect(screen.getByText('TEST_attack 20')).toBeInTheDocument();
    expect(screen.getByText('TEST_health 30_40')).toBeInTheDocument(); // remaining = 40 - 10.
    expect(screen.getByText('TEST_shield_total 4')).toBeInTheDocument();
    expect(screen.getByText('TEST_damage_you_will_take 16')).toBeInTheDocument(); // max(0, 20 - 4).
  });

  it('AC6: damage-you-will-take floors at 0 once shield meets or exceeds attack', () => {
    renderPanel({ spadeShieldTotal: 25 });
    expect(screen.getByText('TEST_damage_you_will_take 0')).toBeInTheDocument();
  });

  describe('Spades enemy immunity (bug regression)', () => {
    // A Spades enemy is immune to Spades -- spadeShieldTotal keeps
    // accumulating raw regardless (gameDef.ts's own doc comment on
    // RegicideG.spadeShieldTotal), but enterStep4 zeroes its EFFECT on the
    // required discard while immune. "Damage you'll take" used to just
    // subtract the raw total unconditionally, so it showed less damage
    // than Step 4 would actually charge for exactly this enemy/shield
    // combination.
    it('ignores the accumulated shield entirely while the Spades enemy is still immune', () => {
      renderPanel({ currentEnemy: spadeKing, spadeShieldTotal: 10, enemyImmunityCancelled: false });
      expect(screen.getByText('TEST_shield_total 10')).toBeInTheDocument(); // raw total still shown as-is.
      expect(screen.getByText('TEST_damage_you_will_take 20')).toBeInTheDocument(); // NOT max(0, 20 - 10).
    });

    it('applies the shield normally once a Jester cancels the Spades enemy\'s immunity', () => {
      renderPanel({ currentEnemy: spadeKing, spadeShieldTotal: 10, enemyImmunityCancelled: true });
      expect(screen.getByText('TEST_damage_you_will_take 10')).toBeInTheDocument(); // max(0, 20 - 10).
    });

    it('a non-Spades enemy is unaffected by enemyImmunityCancelled -- the shield always applies', () => {
      renderPanel({ currentEnemy: king, spadeShieldTotal: 10, enemyImmunityCancelled: false });
      expect(screen.getByText('TEST_damage_you_will_take 10')).toBeInTheDocument(); // max(0, 20 - 10).
    });
  });

  it('AC6: recomputes across snapshots as shield/damage change', () => {
    const { rerender } = renderPanel({ damageDealt: 0, spadeShieldTotal: 0 });
    expect(screen.getByText('TEST_damage_you_will_take 20')).toBeInTheDocument();
    rerender(
      <EnemyPanel
        currentEnemy={king}
        enemyNumber={3}
        damageDealt={5}
        spadeShieldTotal={8}
        enemyImmunityCancelled={false}
        tavernCount={20}
        discardPile={fiveDiscards}
        roundConfirm={null}
      />,
    );
    expect(screen.getByText('TEST_damage_you_will_take 12')).toBeInTheDocument();
    expect(screen.getByText('TEST_health 35_40')).toBeInTheDocument();
  });

  it('AC9: renders tavern and discard counts (as deck stacks) identically regardless of viewer', () => {
    renderPanel();
    expect(screen.getByLabelText('TEST_tavern_count 20')).toBeInTheDocument();
    expect(screen.getByLabelText('TEST_discard_count 5')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('also renders every discarded card next to the discard pile count, not just the count', () => {
    renderPanel();
    for (const card of fiveDiscards) {
      expect(screen.getByRole('button', { name: `TEST_${card.suit} ${card.rank}` })).toBeInTheDocument();
    }
  });

  it('renders the Castle deck as its own stack to the left of the enemy card, counting the still-hidden enemies behind it', () => {
    const { container } = render(
      <EnemyPanel
        currentEnemy={king}
        enemyNumber={3} // enemy 3 of 12 -> 9 still hidden behind it.
        damageDealt={10}
        spadeShieldTotal={4}
        enemyImmunityCancelled={false}
        tavernCount={20}
        discardPile={fiveDiscards}
        roundConfirm={null}
      />,
    );
    const castleStack = screen.getByLabelText('TEST_castle_count 9');
    expect(castleStack).toBeInTheDocument();
    const enemyCard = screen.getByRole('button', { name: 'TEST_D TEST_K' });
    // "to the left of" -- earlier in DOM order within the same row.
    expect(
      castleStack.compareDocumentPosition(enemyCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container).toBeInTheDocument();
  });

  it('the Castle deck stack never goes negative and empties out at the 12th (final) enemy', () => {
    renderPanel({ enemyNumber: 12 });
    expect(screen.getByLabelText('TEST_castle_count 0')).toBeInTheDocument();
  });

  it('renders nothing enemy-specific when currentEnemy is null', () => {
    renderPanel({ currentEnemy: null });
    expect(screen.queryByText(/TEST_attack/)).toBeNull();
    expect(screen.getByLabelText('TEST_tavern_count 20')).toBeInTheDocument();
  });

  describe('AC9a: round-defeat confirmation', () => {
    const pendingConfirm = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] };

    it('shows the defeated badge and keeps showing the frozen enemy state while roundConfirm is pending', () => {
      renderPanel({ roundConfirm: pendingConfirm });
      expect(screen.getByText('TEST_defeated')).toBeInTheDocument();
      expect(screen.getByText('TEST_health 30_40')).toBeInTheDocument(); // still the finishing values.
    });

    it('renders no defeated badge when roundConfirm is null', () => {
      renderPanel({ roundConfirm: null });
      expect(screen.queryByText('TEST_defeated')).toBeNull();
    });

    // The actual N-of-M/Confirm/force-advance controls are intentionally
    // NOT this component's job -- they're GameMount's generic
    // RoundConfirmBanner, same as every other game embedding
    // RoundConfirmG (see plan.md's revised AC9a note and
    // packages/client/src/gameMount/RoundConfirmBanner.test.tsx).
  });
});

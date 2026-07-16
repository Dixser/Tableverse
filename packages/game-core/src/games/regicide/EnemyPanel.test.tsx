// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { EnemyPanel } from './EnemyPanel.js';
import type { FaceCard } from './deck.js';

const king: FaceCard = { id: 'SK', kind: 'face', suit: 'S', rank: 'K' }; // attack 20, health 40.

function renderPanel(overrides: Partial<Parameters<typeof EnemyPanel>[0]> = {}) {
  return render(
    <EnemyPanel
      currentEnemy={king}
      enemyNumber={3}
      damageDealt={10}
      spadeShieldTotal={4}
      tavernCount={20}
      discardCount={5}
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

  it('AC6: recomputes across snapshots as shield/damage change', () => {
    const { rerender } = renderPanel({ damageDealt: 0, spadeShieldTotal: 0 });
    expect(screen.getByText('TEST_damage_you_will_take 20')).toBeInTheDocument();
    rerender(
      <EnemyPanel
        currentEnemy={king}
        enemyNumber={3}
        damageDealt={5}
        spadeShieldTotal={8}
        tavernCount={20}
        discardCount={5}
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

  it('renders the Castle deck as its own stack to the left of the enemy card, counting the still-hidden enemies behind it', () => {
    const { container } = render(
      <EnemyPanel
        currentEnemy={king}
        enemyNumber={3} // enemy 3 of 12 -> 9 still hidden behind it.
        damageDealt={10}
        spadeShieldTotal={4}
        tavernCount={20}
        discardCount={5}
        roundConfirm={null}
      />,
    );
    const castleStack = screen.getByLabelText('TEST_castle_count 9');
    expect(castleStack).toBeInTheDocument();
    const enemyCard = screen.getByRole('button', { name: 'TEST_S TEST_K' });
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

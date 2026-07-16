// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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
      hostPlayerID={null}
      playerID="0"
      onConfirm={vi.fn()}
      onForceAdvance={vi.fn()}
      {...overrides}
    />,
  );
}

describe('EnemyPanel', () => {
  it('AC6: renders enemy number, attack, health (remaining/max), damage dealt, shield, and damage-you-will-take', () => {
    renderPanel();
    expect(screen.getByText('TEST_enemy_number 3')).toBeInTheDocument();
    expect(screen.getByText('TEST_attack 20')).toBeInTheDocument();
    expect(screen.getByText('TEST_health 30_40')).toBeInTheDocument(); // remaining = 40 - 10.
    expect(screen.getByText('TEST_damage_dealt 10')).toBeInTheDocument();
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
        hostPlayerID={null}
        playerID="0"
        onConfirm={vi.fn()}
        onForceAdvance={vi.fn()}
      />,
    );
    expect(screen.getByText('TEST_damage_you_will_take 12')).toBeInTheDocument();
    expect(screen.getByText('TEST_health 35_40')).toBeInTheDocument();
  });

  it('AC9: renders tavern and discard counts identically regardless of viewer', () => {
    renderPanel({ playerID: null });
    expect(screen.getByText('TEST_tavern_count 20')).toBeInTheDocument();
    expect(screen.getByText('TEST_discard_count 5')).toBeInTheDocument();
  });

  it('renders nothing enemy-specific when currentEnemy is null', () => {
    renderPanel({ currentEnemy: null });
    expect(screen.queryByText(/TEST_attack/)).toBeNull();
    expect(screen.getByText('TEST_tavern_count 20')).toBeInTheDocument();
  });

  describe('AC9a: round-defeat confirmation', () => {
    const pendingConfirm = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] };

    it('shows the defeated badge, frozen enemy state, and N of M confirmed', () => {
      renderPanel({ roundConfirm: pendingConfirm, playerID: '1' });
      expect(screen.getByText('TEST_defeated')).toBeInTheDocument();
      expect(screen.getByText('1 of 2 confirmed')).toBeInTheDocument();
      expect(screen.getByText('TEST_damage_dealt 10')).toBeInTheDocument(); // still the finishing values.
    });

    it("disables the acting seat's own Confirm button once already confirmed", () => {
      renderPanel({ roundConfirm: pendingConfirm, playerID: '0' });
      expect(screen.getByText('Ready for next round')).toBeDisabled();
    });

    it('keeps Confirm enabled for another still-pending seat, and calls onConfirm', () => {
      const onConfirm = vi.fn();
      renderPanel({ roundConfirm: pendingConfirm, playerID: '1', onConfirm });
      const button = screen.getByText('Ready for next round');
      expect(button).not.toBeDisabled();
      button.click();
      expect(onConfirm).toHaveBeenCalled();
    });

    it('renders the force-advance control only for the host seat, and calls onForceAdvance', () => {
      const onForceAdvance = vi.fn();
      renderPanel({ roundConfirm: pendingConfirm, playerID: '0', hostPlayerID: '0', onForceAdvance });
      const button = screen.getByText('Skip waiting (host)');
      button.click();
      expect(onForceAdvance).toHaveBeenCalled();
    });

    it('does not render the force-advance control for a non-host seat', () => {
      renderPanel({ roundConfirm: pendingConfirm, playerID: '1', hostPlayerID: '0' });
      expect(screen.queryByText('Skip waiting (host)')).toBeNull();
    });

    it('renders nothing round-confirm-related when roundConfirm is null', () => {
      renderPanel({ roundConfirm: null });
      expect(screen.queryByText('TEST_defeated')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});

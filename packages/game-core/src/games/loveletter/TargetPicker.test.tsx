// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { TargetPicker } from './TargetPicker.js';

describe('TargetPicker (AC2)', () => {
  it('lists only the given eligible players', () => {
    render(
      <TargetPicker eligiblePlayerIDs={['1', '2']} selfID="0" onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    // 2 targets + 1 cancel button.
    expect(buttons).toHaveLength(3);
  });

  it('calls onSelect with the chosen playerID', () => {
    const onSelect = vi.fn();
    render(
      <TargetPicker eligiblePlayerIDs={['1', '2']} selfID="0" onSelect={onSelect} onCancel={vi.fn()} />,
    );
    screen.getByText('Seat 2').click();
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it("labels the acting player's own entry distinctly (Prince self-target, story 6)", () => {
    render(
      <TargetPicker eligiblePlayerIDs={['0']} selfID="0" onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('TEST_yourself')).toBeInTheDocument();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <TargetPicker eligiblePlayerIDs={['1']} selfID="0" onSelect={vi.fn()} onCancel={onCancel} />,
    );
    screen.getByText('TEST_cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('labels a target by username instead of "Seat N" when playerNames is known', () => {
    render(
      <TargetPicker
        eligiblePlayerIDs={['1']}
        selfID="0"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        playerNames={{ '0': 'Alice', '1': 'Bob' }}
      />,
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Seat 2')).toBeNull();
  });
});

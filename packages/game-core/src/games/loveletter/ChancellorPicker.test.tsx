// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { ChancellorPicker } from './ChancellorPicker.js';

describe('ChancellorPicker', () => {
  it('renders one CardTile per candidate in the initial keep step', () => {
    render(<ChancellorPicker candidates={[0, 4, 3]} onKeep={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('TEST_Handmaid')).toBeInTheDocument();
  });

  it('with a full 3-card draw, choosing keep opens a second step to order the return', () => {
    const onKeep = vi.fn();
    render(<ChancellorPicker candidates={[0, 4, 3]} onKeep={onKeep} />);
    fireEvent.click(screen.getByText('TEST_Handmaid').closest('button')!); // keep index 1 (rank 4).
    expect(onKeep).not.toHaveBeenCalled(); // not resolved yet -- order step first.
    expect(screen.getByRole('group', { name: 'TEST_choose_return_order' })).toBeInTheDocument();
    // Only the two non-kept candidates (Spy, Baron) are offered.
    expect(screen.getByText('TEST_Spy')).toBeInTheDocument();
    expect(screen.getByText('TEST_Baron')).toBeInTheDocument();
    expect(screen.queryByText('TEST_Handmaid')).toBeNull();
  });

  it('clicking a card in the order step calls onKeep with keepIndex and the full returnOrder', () => {
    const onKeep = vi.fn();
    render(<ChancellorPicker candidates={[0, 4, 3]} onKeep={onKeep} />);
    fireEvent.click(screen.getByText('TEST_Handmaid').closest('button')!); // keep index 1.
    fireEvent.click(screen.getByText('TEST_Baron').closest('button')!); // index 2 returns first.
    expect(onKeep).toHaveBeenCalledWith(1, [2, 0]);
  });

  it('with exactly 2 candidates, keeping one resolves immediately -- no order choice possible', () => {
    const onKeep = vi.fn();
    render(<ChancellorPicker candidates={[0, 4]} onKeep={onKeep} />);
    fireEvent.click(screen.getByText('TEST_Handmaid').closest('button')!);
    expect(onKeep).toHaveBeenCalledWith(1, [0]);
  });

  it('with a single candidate (near-empty deck), keeping it resolves immediately with no return at all', () => {
    const onKeep = vi.fn();
    render(<ChancellorPicker candidates={[0]} onKeep={onKeep} />);
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(onKeep).toHaveBeenCalledWith(0, []);
  });
});

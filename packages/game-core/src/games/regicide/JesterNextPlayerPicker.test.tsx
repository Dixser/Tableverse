// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { JesterNextPlayerPicker } from './JesterNextPlayerPicker.js';

describe('JesterNextPlayerPicker', () => {
  it('lists every eligible player and calls onSelect with the chosen id', () => {
    const onSelect = vi.fn();
    render(
      <JesterNextPlayerPicker
        eligiblePlayerIDs={['1', '2']}
        onSelect={onSelect}
        onCancel={vi.fn()}
        playerNames={{ '0': 'Alice', '1': 'Bob', '2': 'Carol' }}
      />,
    );
    const group = screen.getByRole('group', { name: 'TEST_choose_who_goes_next' });
    expect(group).toHaveTextContent('Bob');
    expect(group).toHaveTextContent('Carol');
    expect(screen.queryByText('Alice')).toBeNull();
    screen.getByText('Bob').click();
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('calls onCancel', () => {
    const onCancel = vi.fn();
    render(<JesterNextPlayerPicker eligiblePlayerIDs={['1']} onSelect={vi.fn()} onCancel={onCancel} />);
    screen.getByText('TEST_cancel').click();
    expect(onCancel).toHaveBeenCalled();
  });
});

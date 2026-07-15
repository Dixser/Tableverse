// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RoomDrawer } from './RoomDrawer.js';

describe('RoomDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children regardless of open/closed state (CSS-hidden, not unmounted)', () => {
    const { rerender } = render(
      <RoomDrawer open={false} onClose={vi.fn()}>
        <p>drawer content</p>
      </RoomDrawer>,
    );
    expect(screen.getByText('drawer content')).toBeInTheDocument();

    rerender(
      <RoomDrawer open={true} onClose={vi.fn()}>
        <p>drawer content</p>
      </RoomDrawer>,
    );
    expect(screen.getByText('drawer content')).toBeInTheDocument();
  });

  it('reflects open state via data-open, and marks itself inert only while closed', () => {
    const { rerender } = render(
      <RoomDrawer open={false} onClose={vi.fn()}>
        <p>content</p>
      </RoomDrawer>,
    );
    const drawer = screen.getByText('content').closest('[data-open]')!;
    expect(drawer.getAttribute('data-open')).toBe('false');
    expect(drawer.hasAttribute('inert')).toBe(true);

    rerender(
      <RoomDrawer open={true} onClose={vi.fn()}>
        <p>content</p>
      </RoomDrawer>,
    );
    expect(drawer.getAttribute('data-open')).toBe('true');
    expect(drawer.hasAttribute('inert')).toBe(false);
  });

  it('renders a backdrop only while open, and clicking it calls onClose', () => {
    const onClose = vi.fn();
    const { rerender, container } = render(
      <RoomDrawer open={false} onClose={onClose}>
        <p>content</p>
      </RoomDrawer>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();

    rerender(
      <RoomDrawer open={true} onClose={onClose}>
        <p>content</p>
      </RoomDrawer>,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]')!;
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape while open, and does nothing on Escape while closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <RoomDrawer open={false} onClose={onClose}>
        <p>content</p>
      </RoomDrawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <RoomDrawer open={true} onClose={onClose}>
        <p>content</p>
      </RoomDrawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

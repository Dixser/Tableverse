import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';

function SmokeDraggable() {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: 'smoke-drag-item' });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes}>
      drag me
    </button>
  );
}

function SmokeDroppable() {
  const { setNodeRef } = useDroppable({ id: 'smoke-drop-zone' });
  return <div ref={setNodeRef}>drop zone</div>;
}

describe('dnd-kit toolchain smoke test', () => {
  it('completes a pointer drag and fires onDragEnd with the correct dragged id', () => {
    const onDragEnd = vi.fn();
    const { getByText } = render(
      <DndContext onDragEnd={onDragEnd}>
        <SmokeDraggable />
        <SmokeDroppable />
      </DndContext>,
    );

    // `isPrimary: true` is required — dnd-kit's PointerSensor activator
    // rejects any pointer event where `isPrimary` is not `true`. jsdom has
    // no native PointerEvent at all (see vitest.setup.ts's polyfill,
    // added by this feature); passed explicitly here to document why it
    // matters, even though the polyfill also defaults it to `true`.
    const handle = getByText('drag me');
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 10, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(handle, { clientX: 10, clientY: 10, pointerId: 1, isPrimary: true });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const [event] = onDragEnd.mock.calls[0] as [DragEndEvent];
    expect(event.active.id).toBe('smoke-drag-item');
    // `over` depends on real layout/hit-testing (getBoundingClientRect),
    // which jsdom does not provide — see plan.md's "Open risks" for why
    // active.id propagation, not over, is this test's correctness bar.
  });
});

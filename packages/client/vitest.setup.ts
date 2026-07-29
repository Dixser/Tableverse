import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import './src/i18n/i18n.js';

// jsdom (this project's Vitest environment) does not implement a global
// `PointerEvent` constructor. Without it, `fireEvent.pointerDown`/etc.
// silently fall back to a plain `Event`, which fails any code that reads
// pointer-specific fields (`isPrimary`, `pointerId`, `pointerType`) —
// notably @dnd-kit/core's default `PointerSensor`, which requires
// `event.isPrimary` to activate a drag at all. This minimal polyfill only
// adds the fields dnd-kit and similar pointer-aware code read; it is not a
// full spec implementation.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public width: number;
    public height: number;
    public pressure: number;
    public tangentialPressure: number;
    public tiltX: number;
    public tiltY: number;
    public twist: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  // @ts-expect-error -- jsdom's lib.dom types declare PointerEvent but the runtime never defines it
  globalThis.PointerEvent = PointerEventPolyfill;
}

afterEach(() => {
  cleanup();
});

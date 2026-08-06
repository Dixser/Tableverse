import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom (the environment component tests here opt into via
// `// @vitest-environment jsdom`) does not implement a global `PointerEvent`
// constructor. Without it, `fireEvent.pointerDown`/etc. silently fall back to
// a plain `Event`, which fails any code that reads pointer-specific fields
// (`isPrimary`, `pointerId`, `pointerType`) — notably @dnd-kit/core's default
// `PointerSensor`, which requires `event.isPrimary` to activate a drag at all.
//
// Feature 027 discovered this and fixed it in `packages/client/vitest.setup.ts`,
// but board components (and therefore every dnd-kit consumer in this repo) live
// in game-core, whose setup file is separate. Kept a verbatim copy rather than
// a shared module: these two setup files are deliberately independent, and a
// cross-package import here would drag client's config into game-core's.
// This minimal polyfill only adds the fields dnd-kit and similar pointer-aware
// code read; it is not a full spec implementation.
//
// The `MouseEvent` half of the guard is what makes this safe in game-core
// specifically: unlike packages/client, this package's default environment is
// `node` (component tests opt into jsdom per-file), and `MouseEvent` does not
// exist there at all -- extending it unconditionally throws a ReferenceError
// that fails every node-environment suite before it collects.
if (typeof globalThis.PointerEvent === 'undefined' && typeof globalThis.MouseEvent !== 'undefined') {
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

afterEach(async () => {
  // Only relevant for component tests (jsdom environment) -- cheap no-op
  // for the rest of the suite (node environment, no React tree mounted).
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});

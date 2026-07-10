import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

afterEach(async () => {
  // Only relevant for component tests (jsdom environment) -- cheap no-op
  // for the rest of the suite (node environment, no React tree mounted).
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});

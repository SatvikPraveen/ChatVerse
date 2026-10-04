import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom does not ship WebCrypto; @noble needs getRandomValues and the app uses randomUUID.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    configurable: true,
  });
}

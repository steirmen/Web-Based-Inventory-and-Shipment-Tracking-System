import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no canvas: background effects simply don't draw in tests.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// jsdom does not implement scrolling; the router's ScrollRestoration calls it on navigation.
window.scrollTo = (() => {}) as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  // The theme engine writes to <html> and caches in localStorage; start every test fresh.
  document.documentElement.removeAttribute('style');
  for (const key of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[key];
  }
  localStorage.clear();
});

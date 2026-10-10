import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Polyfills for Radix UI in jsdom
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
});

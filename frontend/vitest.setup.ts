import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Recharts' ResponsiveContainer measures its parent, which jsdom reports as 0x0.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= MockResizeObserver as never;

Element.prototype.scrollIntoView ??= vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

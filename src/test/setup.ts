import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { makeChecker } from "../lib/spell/checker";
import { setCheckerFactory } from "../store/spell";

// No web workers in jsdom: by default every word is correct (spelling tests set their own).
setCheckerFactory(() => makeChecker({ request: async () => [], dispose() {} }));

// jsdom lacks these browser APIs; react-resizable-panels needs them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// CodeMirror measures text ranges when scrolling the cursor into view.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

afterEach(() => {
  cleanup();
  localStorage.clear();
});

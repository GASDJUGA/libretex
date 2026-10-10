import { describe, expect, it } from "vitest";
import { isCompileKey, isSyncToPdfKey } from "./shortcuts";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("atajos", () => {
  it("Ctrl+J va al PDF, también si llega como «Enter» (salto de línea)", () => {
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyJ", ctrlKey: true }))).toBe(true);
    const lineFeed = key({ key: "Enter", code: "KeyJ", ctrlKey: true });
    expect(isSyncToPdfKey(lineFeed)).toBe(true);
    expect(isCompileKey(lineFeed)).toBe(false);
    // Another layout puts «j» on another physical key.
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyC", ctrlKey: true }))).toBe(true);
  });

  it("Ctrl+Enter compila; sin Ctrl o con otros modificadores, nada", () => {
    expect(isCompileKey(key({ key: "Enter", code: "Enter", ctrlKey: true }))).toBe(true);
    expect(isCompileKey(key({ key: "Enter", code: "Enter" }))).toBe(false);
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyJ" }))).toBe(false);
    expect(isSyncToPdfKey(key({ key: "J", code: "KeyJ", ctrlKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyJ", ctrlKey: true, altKey: true }))).toBe(
      false,
    );
  });
});

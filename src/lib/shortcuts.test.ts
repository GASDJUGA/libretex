import { describe, expect, it } from "vitest";
import { isCompileKey, isExportPdfKey, isFindKey, isSyncToPdfKey, tabStep } from "./shortcuts";

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

  it("en macOS son con ⌘; Ctrl+letra queda para el texto", () => {
    const mac = true;
    expect(isCompileKey(key({ key: "Enter", code: "Enter", metaKey: true }), mac)).toBe(true);
    expect(isCompileKey(key({ key: "Enter", code: "Enter", ctrlKey: true }), mac)).toBe(false);
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyJ", metaKey: true }), mac)).toBe(true);
    expect(isSyncToPdfKey(key({ key: "j", code: "KeyJ", ctrlKey: true }), mac)).toBe(false);
    expect(isFindKey(key({ key: "f", code: "KeyF", metaKey: true }), mac)).toBe(true);
    expect(
      isExportPdfKey(key({ key: "s", code: "KeyS", metaKey: true, shiftKey: true }), mac),
    ).toBe(true);
    // In Linux nothing changes: Ctrl (and Super, as before).
    expect(isCompileKey(key({ key: "Enter", code: "Enter", ctrlKey: true }), false)).toBe(true);
    expect(isFindKey(key({ key: "f", code: "KeyF", ctrlKey: true }), false)).toBe(true);
  });

  it("pestañas: Ctrl+Tab en los dos y ⇧⌘] / ⇧⌘[ en macOS", () => {
    expect(tabStep(key({ key: "Tab", ctrlKey: true }), true)).toBe(1);
    expect(tabStep(key({ key: "Tab", ctrlKey: true, shiftKey: true }), true)).toBe(-1);
    expect(
      tabStep(key({ key: "}", code: "BracketRight", metaKey: true, shiftKey: true }), true),
    ).toBe(1);
    expect(
      tabStep(key({ key: "{", code: "BracketLeft", metaKey: true, shiftKey: true }), true),
    ).toBe(-1);
    expect(tabStep(key({ key: "Tab", metaKey: true }), true)).toBe(null);
    expect(tabStep(key({ key: "Tab", ctrlKey: true }), false)).toBe(1);
    expect(
      tabStep(key({ key: "}", code: "BracketRight", ctrlKey: true, shiftKey: true }), false),
    ).toBe(null);
  });
});

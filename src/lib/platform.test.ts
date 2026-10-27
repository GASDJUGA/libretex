import { describe, expect, it } from "vitest";
import { keyLabel } from "./platform";

describe("keyLabel", () => {
  it("en Linux, Mod es Ctrl y el resto queda igual", () => {
    expect(keyLabel("Mod+S", false)).toBe("Ctrl+S");
    expect(keyLabel("Mod+Shift+F", false)).toBe("Ctrl+Shift+F");
    expect(keyLabel("Ctrl+Tab", false)).toBe("Ctrl+Tab");
    expect(keyLabel("Mod+/", false)).toBe("Ctrl+/");
    expect(keyLabel("Mod+{wheel}", false)).toBe("Ctrl+{wheel}");
    expect(keyLabel("F1", false)).toBe("F1");
  });

  it("en macOS, símbolos en el orden del sistema", () => {
    expect(keyLabel("Mod+S", true)).toBe("⌘S");
    expect(keyLabel("Mod+Shift+S", true)).toBe("⇧⌘S");
    expect(keyLabel("Mod+Enter", true)).toBe("⌘↩");
    expect(keyLabel("Ctrl+Shift+Tab", true)).toBe("⌃⇧⇥");
    expect(keyLabel("Mod+Shift+]", true)).toBe("⇧⌘]");
    expect(keyLabel("Alt+`", true)).toBe("⌥`");
    expect(keyLabel("Mod+{wheel}", true)).toBe("⌘ {wheel}");
    expect(keyLabel("Tab", true)).toBe("Tab");
    expect(keyLabel("{doubleClick}", true)).toBe("{doubleClick}");
  });
});

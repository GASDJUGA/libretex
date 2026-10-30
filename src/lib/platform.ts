/** Whether the app runs on macOS, where shortcuts use Cmd (⌘) instead of Ctrl. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

const MAC_SYMBOLS: Record<string, string> = {
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Mod: "⌘",
  Enter: "↩",
  Tab: "⇥",
};
/** The order macOS writes its modifiers in. */
const MAC_ORDER = ["Ctrl", "Alt", "Shift", "Mod"];

/**
 * A shortcut as the user reads it. `Mod` is the main modifier (Ctrl on Linux, ⌘ on macOS);
 * `Ctrl` is the Control key everywhere. On macOS the modifiers become symbols in their usual
 * order (`Mod+Shift+S` → `⇧⌘S`); a `{name}` key (translated later) is set apart with a space.
 */
export function keyLabel(keys: string, mac = IS_MAC): string {
  const parts = keys.split("+");
  const key = parts.pop() ?? "";
  if (!mac) return [...parts.map((m) => (m === "Mod" ? "Ctrl" : m)), key].join("+");
  const mods = MAC_ORDER.filter((m) => parts.includes(m))
    .map((m) => MAC_SYMBOLS[m])
    .join("");
  if (parts.length === 0) return key;
  const text = MAC_SYMBOLS[key] ?? key;
  return mods && text.startsWith("{") ? `${mods} ${text}` : mods + text;
}

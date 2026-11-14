/**
 * Where versions before phase 9 (October 2026) kept the editor preferences; `store/settings`
 * still reads it once and moves it to `settings.json`, so it keeps its old name. Here, so
 * this module imports nothing and can run before any store.
 */
export const LEGACY_STORAGE_KEY = "libretex:settings";

/**
 * Prefixes of what the app kept in `localStorage` under its old name, LibreTeX, and their
 * new ones (2.0.0): its own keys, and the ones the panels library builds from our ids.
 */
export const STORAGE_RENAMES: [from: string, to: string][] = [
  ["libretex:", "jutex:"],
  ["react-resizable-panels:libretex:", "react-resizable-panels:jutex:"],
];

/**
 * Moves what LibreTeX left in the browser storage (sessions, tabs, panel sizes, completion
 * use) to JuTeX's keys, once, before the interface reads them. A key already under the new
 * name wins; the old one goes anyway. The settings of October stay where their own
 * migration reads them (`LEGACY_STORAGE_KEY`). Storage that cannot be read is left alone.
 */
export function migrateStorage(storage: Storage, renames = STORAGE_RENAMES): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      if (key === LEGACY_STORAGE_KEY) continue;
      const rename = renames.find(([from]) => key.startsWith(from));
      if (!rename) continue;
      const [from, to] = rename;
      const value = storage.getItem(key);
      const target = to + key.slice(from.length);
      if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
      storage.removeItem(key);
    }
  } catch {
    // Blocked or full storage: the app starts with what it can read.
  }
}

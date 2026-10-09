import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Automatic indentation when pressing Enter:
 * - `environments`: inside environments (itemize, equation…) and braces, not under
 *   sections nor directly inside `document` (like Overleaf);
 * - `full`: the grammar's indentation, which also indents the body of sections;
 * - `none`: keep the previous line's indentation.
 */
export type IndentMode = "environments" | "full" | "none";

type SettingsState = {
  indentMode: IndentMode;
  setIndentMode: (mode: IndentMode) => void;
};

/**
 * Editor preferences. Kept in localStorage for now; phase 9 moves every setting to
 * ~/.config/libretex/settings.json.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      indentMode: "environments",
      setIndentMode: (indentMode) => set({ indentMode }),
    }),
    {
      name: "libretex:settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ indentMode: s.indentMode }),
    },
  ),
);

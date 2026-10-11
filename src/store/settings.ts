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
  /** Mark unclosed braces, environments and formulas while typing (no compilation). */
  liveCheck: boolean;
  setLiveCheck: (on: boolean) => void;
  /** Rendered preview of the formula under the cursor (5.5). */
  mathPreview: boolean;
  setMathPreview: (on: boolean) => void;
  /** Also preview a formula when the mouse rests on it. */
  mathPreviewHover: boolean;
  setMathPreviewHover: (on: boolean) => void;
  /** Show PDF pages with inverted colors (dark background, light text). */
  pdfDarkMode: boolean;
  setPdfDarkMode: (on: boolean) => void;
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
      liveCheck: true,
      setLiveCheck: (liveCheck) => set({ liveCheck }),
      mathPreview: true,
      setMathPreview: (mathPreview) => set({ mathPreview }),
      mathPreviewHover: false,
      setMathPreviewHover: (mathPreviewHover) => set({ mathPreviewHover }),
      pdfDarkMode: false,
      setPdfDarkMode: (pdfDarkMode) => set({ pdfDarkMode }),
    }),
    {
      name: "libretex:settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        indentMode: s.indentMode,
        liveCheck: s.liveCheck,
        mathPreview: s.mathPreview,
        mathPreviewHover: s.mathPreviewHover,
        pdfDarkMode: s.pdfDarkMode,
      }),
    },
  ),
);

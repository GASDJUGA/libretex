import { create } from "zustand";
import { useI18n } from "../i18n";
import { notifyError } from "../lib/errors";
import { DEFAULT_SETTINGS, editableSettings } from "../lib/settings";
import { getBackend } from "../lib/tauri";
import type { AppDirs, EditableSettings, IndentMode, Settings, SettingsInfo } from "./types";

/**
 * Automatic indentation when pressing Enter:
 * - `environments`: inside environments (itemize, equation…) and braces, not under
 *   sections nor directly inside `document` (like Overleaf);
 * - `full`: the grammar's indentation, which also indents the body of sections;
 * - `none`: keep the previous line's indentation.
 */
export type { IndentMode };

type SettingsState = EditableSettings & {
  /** Where new projects go (with `~`). */
  projectsDir: string;
  /** LibreTeX's own folders (null until read). */
  appDirs: AppDirs | null;
  /** The settings were read from settings.json. */
  loaded: boolean;

  /** Reads settings.json (and moves there what older versions kept in the browser). */
  load: () => Promise<void>;
  /** Applies `changes` at once and saves them. */
  update: (changes: Partial<EditableSettings>) => Promise<void>;
  /** Native dialog for the projects folder. */
  chooseProjectsDir: (title: string) => Promise<void>;

  setIndentMode: (mode: IndentMode) => void;
  setLiveCheck: (on: boolean) => void;
  setMathPreview: (on: boolean) => void;
  setMathPreviewHover: (on: boolean) => void;
  setPdfDarkMode: (on: boolean) => void;
};

/** Where versions before phase 9 kept the editor preferences. */
export const LEGACY_STORAGE_KEY = "libretex:settings";

function legacySettings(): Partial<EditableSettings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const stored = (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {};
    return editableSettings(stored);
  } catch {
    return null;
  }
}

/** The settings without those changed by their own commands. */
function editableOf(settings: Settings): EditableSettings {
  const editable: Partial<Settings> = { ...settings };
  delete editable.projectsDir;
  delete editable.texDistribution;
  return editable as EditableSettings;
}

export const initialSettingsState = {
  ...editableOf(DEFAULT_SETTINGS),
  projectsDir: "~/LibreTeX",
  appDirs: null as AppDirs | null,
  loaded: false,
};

export const useSettings = create<SettingsState>()((set, get) => {
  const apply = (info: SettingsInfo) => {
    const editable = editableOf(info.settings);
    set({ ...editable, projectsDir: info.projectsDir, appDirs: info.appDirs, loaded: true });
    if (useI18n.getState().locale !== editable.locale)
      useI18n.getState().setLocale(editable.locale);
  };

  return {
    ...initialSettingsState,

    load: async () => {
      apply(await getBackend().getSettings());
      const legacy = legacySettings();
      if (legacy) {
        if (Object.keys(legacy).length > 0) apply(await getBackend().updateSettings(legacy));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    },

    update: async (changes) => {
      set(changes);
      if (changes.locale) useI18n.getState().setLocale(changes.locale);
      try {
        apply(await getBackend().updateSettings(changes));
      } catch (error) {
        notifyError(error);
        await get()
          .load()
          .catch(() => {});
      }
    },

    chooseProjectsDir: async (title) => {
      const info = await getBackend().chooseProjectsDir(title);
      if (info) apply(info);
    },

    setIndentMode: (indentMode) => void get().update({ indentMode }),
    setLiveCheck: (liveCheck) => void get().update({ liveCheck }),
    setMathPreview: (mathPreview) => void get().update({ mathPreview }),
    setMathPreviewHover: (mathPreviewHover) => void get().update({ mathPreviewHover }),
    setPdfDarkMode: (pdfDarkMode) => void get().update({ pdfDarkMode }),
  };
});

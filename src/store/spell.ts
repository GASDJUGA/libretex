import { create } from "zustand";
import { notifyError } from "../lib/errors";
import { workerChecker, type SpellChecker } from "../lib/spell/checker";
import { getBackend } from "../lib/tauri";
import { useProjects } from "./projects";
import type { SpellLang } from "./types";

type SpellState = {
  /** Words of the personal dictionary. */
  personal: string[];
  /** Increases when what counts as correct changes (dictionary, language): recheck. */
  version: number;

  loadPersonal: () => Promise<void>;
  addWord: (word: string) => Promise<void>;
  removeWord: (word: string) => Promise<void>;
  /** Changes the open project's spelling language (saved in its project.json). */
  setLanguage: (lang: SpellLang) => Promise<void>;
};

/** One checker per language, created the first time it is needed (its own worker). */
const checkers = new Map<Exclude<SpellLang, "off">, SpellChecker>();
let createChecker = workerChecker;

/** For tests: checkers without workers. */
export function setCheckerFactory(factory: typeof workerChecker) {
  for (const checker of checkers.values()) checker.dispose();
  checkers.clear();
  createChecker = factory;
}

/** The checker of the open project's language, or null if it is not checked. */
export function currentChecker(): SpellChecker | null {
  const lang = useProjects.getState().current?.spellLang ?? "es";
  if (lang === "off") return null;
  let checker = checkers.get(lang);
  if (!checker) {
    checker = createChecker(lang);
    checker.setPersonal(useSpell.getState().personal);
    checkers.set(lang, checker);
  }
  return checker;
}

export const initialSpellState = { personal: [] as string[], version: 0 };

export const useSpell = create<SpellState>()((set, get) => {
  const apply = (personal: string[]) => {
    for (const checker of checkers.values()) checker.setPersonal(personal);
    set((s) => ({ personal, version: s.version + 1 }));
  };
  return {
    ...initialSpellState,

    loadPersonal: async () => apply(await getBackend().personalDictionary()),

    addWord: async (word) => {
      // Accepted at once; the file follows.
      apply([...new Set([...get().personal, word])]);
      try {
        apply(await getBackend().addToDictionary(word));
      } catch (error) {
        notifyError(error);
        await get().loadPersonal();
      }
    },

    removeWord: async (word) => {
      try {
        apply(await getBackend().removeFromDictionary(word));
      } catch (error) {
        notifyError(error);
      }
    },

    setLanguage: async (spellLang) => {
      const project = useProjects.getState().current;
      if (!project || project.spellLang === spellLang) return;
      await useProjects.getState().updateMeta(project.id, { spellLang });
      set((s) => ({ version: s.version + 1 }));
    },
  };
});

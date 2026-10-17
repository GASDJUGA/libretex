import { create } from "zustand";
import { getActiveView } from "../editor/activeView";
import { errorText } from "../lib/errors";
import { selectedSearchText } from "../lib/shortcuts";
import { getBackend } from "../lib/tauri";
import { useBuffers } from "./buffers";
import { useProjectView } from "./project";
import { useProjectIndex } from "./projectIndex";
import type { Replaced, SearchQuery, SearchResults } from "./types";

/** Pause after the last keystroke before searching. */
export const SEARCH_DELAY_MS = 250;

type SearchState = {
  query: SearchQuery;
  replacement: string;
  results: SearchResults | null;
  status: "idle" | "searching" | "done" | "error";
  /** Why the search failed (translated), and the technical detail. */
  error: { text: string; detail?: string } | null;
  replacing: boolean;
  /** Increases to ask the panel to focus (and select) the search field. */
  focusRequest: number;

  /** Changes the query and searches shortly after (typing). */
  setQuery: (changes: Partial<SearchQuery>) => void;
  setReplacement: (replacement: string) => void;
  /** Searches now (saving the edited files first: the search reads the disk). */
  search: () => Promise<void>;
  /**
   * Replaces the occurrences in `paths` (default: every file with results), reloads the
   * open files that changed and searches again.
   */
  replace: (paths?: string[]) => Promise<Replaced[]>;
  /** Ctrl+Shift+F: shows the panel and focuses the field, optionally with `text`. */
  open: (text?: string) => void;
  /** Another project was opened. */
  reset: () => void;
};

const projectId = () => useBuffers.getState().projectId;

let timer: ReturnType<typeof setTimeout> | undefined;
/** Increases with each search: an older one that finishes late is dropped. */
let seq = 0;

export const initialSearchState = {
  query: { text: "", regex: false, caseSensitive: false, wholeWord: false },
  replacement: "",
  results: null,
  status: "idle" as const,
  error: null,
  replacing: false,
  focusRequest: 0,
};

export const useSearch = create<SearchState>()((set, get) => ({
  ...initialSearchState,

  setQuery: (changes) => {
    set((s) => ({ query: { ...s.query, ...changes } }));
    clearTimeout(timer);
    timer = setTimeout(() => void get().search(), SEARCH_DELAY_MS);
  },

  setReplacement: (replacement) => set({ replacement }),

  search: async () => {
    clearTimeout(timer);
    const id = projectId();
    const { query } = get();
    const current = ++seq;
    if (!id || !query.text) {
      set({ results: null, status: "idle", error: null });
      return;
    }
    set({ status: "searching" });
    try {
      await useBuffers.getState().saveAll();
      const results = await getBackend().searchProject(id, query);
      if (current === seq && projectId() === id) set({ results, status: "done", error: null });
    } catch (error) {
      if (current === seq && projectId() === id) {
        set({ results: null, status: "error", error: errorText(error) });
      }
    }
  },

  replace: async (paths) => {
    const id = projectId();
    const { query, replacement, results } = get();
    const files = paths ?? results?.files.map((f) => f.path) ?? [];
    if (!id || !query.text || files.length === 0) return [];
    set({ replacing: true });
    try {
      await useBuffers.getState().saveAll();
      const done = await getBackend().replaceInProject(id, query, replacement, files);
      const changed = done.map((r) => r.path);
      // The open files show the new text at once (the watcher would too, a bit later).
      await useBuffers.getState().applyDiskChanges(changed);
      if (changed.some((p) => p.endsWith(".tex") || p.endsWith(".bib"))) {
        useProjectIndex
          .getState()
          .load(id)
          .catch(() => {});
      }
      return done;
    } finally {
      set({ replacing: false });
      await get().search();
    }
  },

  open: (text) => {
    useProjectView.getState().openSidePanel("search");
    set((s) => ({ focusRequest: s.focusRequest + 1 }));
    if (text && text !== get().query.text) get().setQuery({ text });
  },

  reset: () => {
    clearTimeout(timer);
    seq++;
    set({ ...initialSearchState, focusRequest: get().focusRequest });
  },
}));

/** Ctrl+Shift+F / «Editar» menu: the search panel, with the editor's selection if any. */
export function openProjectSearch() {
  const view = getActiveView();
  const range = view?.state.selection.main;
  const selected = view && range ? view.state.sliceDoc(range.from, range.to) : "";
  useSearch.getState().open(selectedSearchText(selected));
}

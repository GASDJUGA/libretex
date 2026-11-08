import { create } from "zustand";

/**
 * Loading a project, step by step, for the «Cargando proyecto» bar (pedido del usuario: una
 * barra que se complete a medida que carga, como la de un Mac al iniciarse). Each part marks
 * its step when it is ready: the project is open, its files are listed, the editor shows the
 * text and the PDF is drawn (a step that is hidden or has nothing to show counts as done).
 */
export type LoadStep = "opened" | "files" | "editor" | "pdf";

export const LOAD_STEPS: LoadStep[] = ["opened", "files", "editor", "pdf"];

type LoadingState = {
  /** Project being loaded (marks for another one are ignored). */
  projectId: string | null;
  done: LoadStep[];
  begin: (projectId: string) => void;
  mark: (projectId: string, step: LoadStep) => void;
};

export const useLoading = create<LoadingState>()((set, get) => ({
  projectId: null,
  done: [],
  begin: (projectId) => set({ projectId, done: [] }),
  mark: (projectId, step) => {
    const { projectId: loading, done } = get();
    if (loading !== projectId || done.includes(step)) return;
    set({ done: [...done, step] });
  },
}));

/** Whether `projectId` finished loading. */
export const isLoaded = (state: Pick<LoadingState, "projectId" | "done">, projectId: string) =>
  state.projectId === projectId && state.done.length === LOAD_STEPS.length;

/**
 * Where the bar heads with `done` steps ready: most of the way to the next one, which it only
 * reaches when that step is done. With its slow easing it keeps moving while a long step (a
 * big PDF) loads, and jumps ahead when a step finishes.
 */
export const barTarget = (done: number) => Math.min(1, (done + 0.85) / LOAD_STEPS.length);

/** For tests. */
export const initialLoadingState = { projectId: null, done: [] as LoadStep[] };

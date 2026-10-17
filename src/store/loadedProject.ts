/**
 * Which project the per-project stores hold (several projects can be open as tabs; see
 * workspaces.ts). Async work started for one project checks this before writing its result,
 * so a save or a reload that finishes after switching tabs never lands in another project.
 */
let loaded: string | null = null;

export const loadedProject = () => loaded;

export function setLoadedProject(projectId: string | null) {
  loaded = projectId;
}

/** `projectId` is no longer the one in the stores (null: nothing decided yet, e.g. tests). */
export const isStale = (projectId: string) => loaded !== null && loaded !== projectId;

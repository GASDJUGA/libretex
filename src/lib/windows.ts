/**
 * Several windows, like a browser (pedido del usuario: arrastrar una pestaña fuera para ver
 * dos proyectos a la vez). Each window runs its own copy of the app; the backend knows which
 * window has which project (one window per project) and passes requests between them.
 */
import { notifyError } from "./errors";
import { flushSessions } from "./session";
import { getBackend, windowLabel } from "./tauri";
import { useAppStore } from "../store/app";
import { useBuffers } from "../store/buffers";
import { useProjects } from "../store/projects";
import { useSettings } from "../store/settings";
import { moveToNewWindow, useWorkspaces } from "../store/workspaces";
import type { WindowRequest } from "../store/types";

/** Drag data of a project tab (its id), readable by the other windows. */
export const TAB_MIME = "application/x-jutex-tab";

/** Focus events arrive several at once: one reload of settings and projects for all. */
const RELOAD_ON_FOCUS_MS = 500;

/** Longest wait for the files to be saved before a window closes anyway. */
const SAVE_BEFORE_CLOSE_MS = 3000;

let label = "main";

/** This window's label (after `startWindow`). */
export const thisWindow = () => label;

/**
 * Starts this window: opens the project it was created for, keeps the backend informed of
 * its tabs and answers the requests of the other windows. Returns the cleanup.
 */
export async function startWindow(): Promise<() => void> {
  const backend = getBackend();
  if (!backend.multiWindow) return () => {};
  // Listening before asking for the start: a prepared window may get its project as a
  // request while it is still starting (otherwise it comes with the start).
  label = windowLabel();
  const stopRequests = backend.onWindowRequest((request) => {
    if (request.to === label) void answer(request);
  });
  const start = await backend.windowStart();
  label = start.label;

  const report = (tabs: string[]) => void backend.setWindowProjects(tabs).catch(() => {});
  report(useWorkspaces.getState().tabs);
  const stopTabs = useWorkspaces.subscribe((s, before) => {
    if (s.tabs !== before.tabs) report(s.tabs);
  });
  if (start.project) useWorkspaces.getState().open(start.project);

  // The title says which project is on screen (task bar, Alt+Tab).
  const title = () => {
    const route = useAppStore.getState().route;
    const name =
      route.name === "project"
        ? useProjects.getState().projects.find((p) => p.id === route.projectId)?.name
        : undefined;
    return name ? `${name} — JuTeX` : "JuTeX";
  };
  let shown = "";
  const updateTitle = () => {
    const next = title();
    if (next === shown) return;
    shown = next;
    void backend.setWindowTitle(next).catch(() => {});
  };
  updateTitle();
  const stopRoute = useAppStore.subscribe(updateTitle);
  const stopNames = useProjects.subscribe(updateTitle);

  // What another window changed (settings, the list of projects) shows up on coming back;
  // once for the burst of focus events of a single switch.
  let lastReload = performance.now();
  const onFocus = () => {
    if (performance.now() - lastReload < RELOAD_ON_FOCUS_MS) return;
    lastReload = performance.now();
    useSettings
      .getState()
      .load()
      .catch(() => {});
    useProjects
      .getState()
      .load()
      .catch(() => {});
  };
  window.addEventListener("focus", onFocus);
  const stopDrops = acceptTabDrops();

  return () => {
    stopTabs();
    stopRequests();
    stopRoute();
    stopNames();
    stopDrops();
    window.removeEventListener("focus", onFocus);
  };
}

async function answer(request: WindowRequest) {
  const backend = getBackend();
  switch (request.kind) {
    case "show":
      useWorkspaces.getState().open(request.id);
      break;
    case "give":
      // Another window wants this tab (it was dropped there): save, close, hand it over.
      askedFor.add(request.id);
      await useWorkspaces.getState().close(request.id);
      await backend.giveProject(request.id, request.target).catch(notifyError);
      break;
    case "close":
      // Nothing is lost: what was typed is saved before the window goes away.
      await Promise.race([
        useBuffers
          .getState()
          .saveAll()
          .catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, SAVE_BEFORE_CLOSE_MS)),
      ]);
      // Closing the window this way fires no `pagehide`: the last places are written now.
      flushSessions();
      await backend.closeWindow().catch(() => {});
      break;
  }
}

/** Tabs another window asked for (dropped there), to tell that from a release outside. */
const askedFor = new Set<string>();
/** How long another window has to ask for a tab released outside this one. */
const ASK_WAIT_MS = 400;

/** True while the dragged tab is outside this window (to open it in a new one on release). */
let dragOutside = false;

/** A project tab dropped anywhere on this window comes here (from another window). */
function acceptTabDrops(): () => void {
  const isTab = (e: DragEvent) => e.dataTransfer?.types.includes(TAB_MIME) ?? false;
  const onOver = (e: DragEvent) => {
    dragOutside = false;
    if (!isTab(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  };
  const onLeave = (e: DragEvent) => {
    // Leaving the page (not just an element): the pointer is outside the window.
    if (!e.relatedTarget) dragOutside = true;
  };
  const onDrop = (e: DragEvent) => {
    if (!isTab(e) || e.defaultPrevented) return;
    e.preventDefault();
    const id = e.dataTransfer?.getData(TAB_MIME);
    if (id && !useWorkspaces.getState().tabs.includes(id)) {
      void getBackend().requestProject(id).catch(notifyError);
    }
  };
  document.addEventListener("dragover", onOver);
  document.addEventListener("dragleave", onLeave);
  document.addEventListener("drop", onDrop);
  return () => {
    document.removeEventListener("dragover", onOver);
    document.removeEventListener("dragleave", onLeave);
    document.removeEventListener("drop", onDrop);
  };
}

/** A tab drag starts in this window. */
export function tabDragStarted(e: { dataTransfer: DataTransfer | null }, projectId: string) {
  dragOutside = false;
  e.dataTransfer?.setData(TAB_MIME, projectId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

/**
 * A tab drag of this window ended: released outside every window (nothing took it), the
 * project moves to a new window. Dropped on another window, that one asks for it.
 */
export function tabDragEnded(e: { dataTransfer: DataTransfer | null }, projectId: string) {
  const outside = dragOutside;
  dragOutside = false;
  if (!getBackend().multiWindow || !outside) return;
  if (e.dataTransfer?.dropEffect === "none") {
    void moveToNewWindow(projectId).catch(notifyError);
    return;
  }
  // WebKitGTK on Wayland reports the page's own last effect («move») even when the tab was
  // released on the desktop or another app (seen in the user's session): whether a window
  // took it is known instead by that window asking for it, right after the drop.
  askedFor.delete(projectId);
  setTimeout(() => {
    if (askedFor.delete(projectId) || !useWorkspaces.getState().tabs.includes(projectId)) return;
    void moveToNewWindow(projectId).catch(notifyError);
  }, ASK_WAIT_MS);
}

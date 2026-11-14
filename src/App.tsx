import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { Toaster } from "./components/common/Toaster";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { notifyError } from "./lib/errors";
import { useAppStore } from "./store/app";
import { useSettings } from "./store/settings";
import { useTex } from "./store/tex";
import { applyEditorAppearance, applyUiTheme } from "./lib/appearance";
import { TabStrip } from "./components/layout/TabStrip";
import { HelpDialogs } from "./components/help/HelpDialogs";
import { useHelp } from "./store/help";
import { tabStep } from "./lib/shortcuts";
import { getBackend } from "./lib/tauri";
import { useCompile } from "./store/compile";
import { autoSnapshot } from "./store/history";
import { useProjects } from "./store/projects";
import {
  dropMissingTabs,
  handleBackgroundCompileEvent,
  restoreActiveTab,
  useWorkspaces,
} from "./store/workspaces";
import { startWindow } from "./lib/windows";
import { canAnimate, entranceFor, playOnFirstFrame, useEntrance } from "./lib/transition";
import type { Route } from "./store/app";
import { LOADING_MAX_MS, ProjectLoading } from "./components/layout/ProjectLoading";
import { isLoaded, useLoading } from "./store/loading";

const routeKey = (route: Route) =>
  route.name === "project" ? `project:${route.projectId}` : "home";

/** How long the view on screen takes to go when another tab is chosen (`jt-view-out-*`). */
const LEAVE_MS = 110;

function App() {
  const route = useAppStore((s) => s.route);
  // Changing tabs, the view on screen fades out first (the click shows at once) and only then
  // the next one is mounted, which can keep the page busy for a moment. Choosing several tabs
  // in a row (Ctrl+Tab) only mounts the last one.
  // Without animations (tests), the next view is shown at once.
  const [settled, setShown] = useState(route);
  const shown = canAnimate() ? settled : route;
  const leaving = routeKey(shown) !== routeKey(route);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      // From here, what the next project's parts mark is its loading.
      if (route.name === "project") useLoading.getState().begin(route.projectId);
      setShown(route);
    }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, route]);
  // The view comes in from the side of its tab (Home is the first one).
  const viewKey = routeKey(shown);
  const orderOf = useWorkspaces((s) => s.tabs);
  const order = (r: Route) => (r.name === "project" ? orderOf.indexOf(r.projectId) : -1);
  const entrance = useEntrance(viewKey, order(shown));
  const leaveTo = entranceFor(order(shown), order(route));
  const viewRef = useRef<HTMLDivElement>(null);
  // A project comes in once it is loaded («Cargando proyecto» covers it meanwhile; at most
  // LOADING_MAX_MS); home, at its first frame.
  const loadingId = canAnimate() && shown.name === "project" ? shown.projectId : null;
  useLayoutEffect(() => {
    if (loadingId && useLoading.getState().projectId !== loadingId) {
      useLoading.getState().begin(loadingId);
    }
  }, [loadingId]);
  const loaded = useLoading((s) => (loadingId ? isLoaded(s, loadingId) : true));
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  useEffect(() => {
    if (!loadingId) return;
    const timer = setTimeout(() => setGaveUp(loadingId), LOADING_MAX_MS);
    return () => clearTimeout(timer);
  }, [loadingId]);
  const ready = loaded || gaveUp === loadingId;
  // Also when going back to it while it was leaving (its entrance class, held, comes back).
  useLayoutEffect(() => {
    if (ready) return playOnFirstFrame(viewRef.current);
  }, [viewKey, leaving, ready]);

  // Detect the TeX tools once at startup (cached by the backend), and read the settings.
  useEffect(() => {
    useTex.getState().load().catch(notifyError);
    useSettings.getState().load().catch(notifyError);
  }, []);

  // Several windows: this one's project, its tabs reported to the backend, tabs dropped from
  // other windows, saving before closing.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    startWindow()
      .then((cleanup) => {
        if (cancelled) cleanup();
        else stop = cleanup;
      })
      .catch(notifyError);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // Compilations of projects whose tab is not on screen (the project view handles its own).
  useEffect(
    () =>
      getBackend().onCompileEvent((event) => {
        if (handleBackgroundCompileEvent(event)) return;
        if (useAppStore.getState().route.name !== "project") {
          useCompile.getState().handleEvent(event);
        }
      }),
    [],
  );

  // F1: the shortcuts. Ctrl+Tab / Ctrl+Shift+Tab (and Ctrl+PageDown / Ctrl+PageUp) go
  // through the tabs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        useHelp.getState().show("shortcuts");
        return;
      }
      const step = tabStep(e);
      if (!step) return;
      e.preventDefault();
      useWorkspaces.getState().cycle(step);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Projects removed from the list (trash, «quitar de la lista») lose their tab; once they
  // are known, the tab that was on screen when the app closed comes back.
  const projectsStatus = useProjects((s) => s.status);
  const projectList = useProjects((s) => s.projects);
  useEffect(() => {
    if (projectsStatus !== "ready") return;
    dropMissingTabs();
    restoreActiveTab();
  }, [projectsStatus, projectList]);

  // Automatic versions of the open projects every few minutes (Settings; 0 = off).
  const historyMinutes = useSettings((s) => s.historyMinutes);
  useEffect(() => {
    if (historyMinutes <= 0) return;
    const timer = setInterval(
      () => void autoSnapshot(useWorkspaces.getState().tabs),
      historyMinutes * 60_000,
    );
    return () => clearInterval(timer);
  }, [historyMinutes]);

  // Interface theme, editor theme and font, applied live.
  const uiTheme = useSettings((s) => s.uiTheme);
  useEffect(() => applyUiTheme(uiTheme), [uiTheme]);
  const editorTheme = useSettings((s) => s.editorTheme);
  const editorFontFamily = useSettings((s) => s.editorFontFamily);
  const editorFontSize = useSettings((s) => s.editorFontSize);
  useEffect(
    () => applyEditorAppearance({ editorTheme, editorFontFamily, editorFontSize }),
    [editorTheme, editorFontFamily, editorFontSize],
  );

  return (
    <>
      <div className="flex h-full flex-col">
        <TabStrip />
        {/* One view per tab (a fresh Project, and editor, for each project); it comes in with
            a short transition from the side of its tab when it changes. Clipped: a view moved
            to one side (coming in, waiting for its project, going) would make the page wider
            or taller than the window, and a trackpad scroll or a scrollIntoView then moved the
            whole page, tabs included, until the animation ended (seen on macOS). `clip`, not
            `hidden`: this box itself never scrolls. */}
        <div className="relative min-h-0 flex-1 overflow-clip">
          <div
            key={viewKey}
            ref={viewRef}
            className={`${
              leaving
                ? `jt-view-out-${leaveTo}`
                : `${entrance === "none" ? "jt-view-in" : `jt-view-${entrance}`} jt-hold`
            } h-full`}
          >
            {shown.name === "project" ? <Project projectId={shown.projectId} /> : <Home />}
          </div>
          {loadingId && !leaving && <ProjectLoading key={loadingId} projectId={loadingId} />}
        </div>
      </div>
      <HelpDialogs />
      <Toaster />
    </>
  );
}

export default App;

import { Home } from "./app/Home";
import { Project } from "./app/Project";
import { Toaster } from "./components/common/Toaster";
import { useEffect } from "react";
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
import { dropMissingTabs, handleBackgroundCompileEvent, useWorkspaces } from "./store/workspaces";
import { startWindow } from "./lib/windows";
import { useEntrance } from "./lib/transition";

function App() {
  const route = useAppStore((s) => s.route);
  // The view comes in from the side of its tab (Home is the first one).
  const viewKey = route.name === "project" ? `project:${route.projectId}` : "home";
  const tabOrder = useWorkspaces((s) =>
    route.name === "project" ? s.tabs.indexOf(route.projectId) : -1,
  );
  const entrance = useEntrance(viewKey, tabOrder);

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

  // Projects removed from the list (trash, «quitar de la lista») lose their tab.
  const projectsStatus = useProjects((s) => s.status);
  const projectList = useProjects((s) => s.projects);
  useEffect(() => {
    if (projectsStatus === "ready") dropMissingTabs();
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
            a short transition from the side of its tab when it changes. */}
        <div
          key={viewKey}
          className={`${entrance === "none" ? "lt-view-in" : `lt-view-${entrance}`} min-h-0 flex-1`}
        >
          {route.name === "project" ? <Project projectId={route.projectId} /> : <Home />}
        </div>
      </div>
      <HelpDialogs />
      <Toaster />
    </>
  );
}

export default App;

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

function App() {
  const route = useAppStore((s) => s.route);

  // Detect the TeX tools once at startup (cached by the backend), and read the settings.
  useEffect(() => {
    useTex.getState().load().catch(notifyError);
    useSettings.getState().load().catch(notifyError);
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
        <div className="min-h-0 flex-1">
          {/* One Project per tab: a fresh view (and editor) for each project. */}
          {route.name === "project" ? (
            <Project key={route.projectId} projectId={route.projectId} />
          ) : (
            <Home />
          )}
        </div>
      </div>
      <HelpDialogs />
      <Toaster />
    </>
  );
}

export default App;

import { isCompileKey, isExportPdfKey, isProjectSearchKey, isSyncToPdfKey } from "../lib/shortcuts";
import { exportPdf } from "../lib/export";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { EditorPane } from "../components/editor/EditorPane";
import { HistoryPane } from "../components/history/HistoryPane";
import { FileTree } from "../components/filetree/FileTree";
import { IconRail } from "../components/layout/IconRail";
import { canAnimate, holdUntilDrawn, useEntrance } from "../lib/transition";
import { useLoading } from "../store/loading";
import { ResizeHandle } from "../components/layout/ResizeHandle";
import { PackagesPanel } from "../components/packages/PackagesPanel";
import { SearchPanel } from "../components/search/SearchPanel";
import { openProjectSearch, useSearch } from "../store/search";
import { activateWorkspace, refreshCompiling, useWorkspaces } from "../store/workspaces";
import { useSpell } from "../store/spell";
import { TexWarning } from "../components/compile/TexWarning";
import { TrustWarning } from "../components/compile/TrustWarning";
import { PasteImageDialog } from "../components/editor/PasteImageDialog";
import { LogsPanel } from "../components/logs/LogsPanel";
import { BackupPanel } from "../components/backup/BackupPanel";
import { TopBar } from "../components/layout/TopBar";
import { Outline } from "../components/outline/Outline";
import { PdfPane } from "../components/pdf/PdfPane";
import { translate, useI18n, useT } from "../i18n";
import { notifyError } from "../lib/errors";
import { flushSessions, loadSession, rememberView, restoredTabs } from "../lib/session";
import { getBackend } from "../lib/tauri";
import { notifyInfo } from "../lib/errors";
import { ConflictDialog } from "../components/editor/ConflictDialog";
import { useBuffers } from "../store/buffers";
import { useCompile } from "../store/compile";
import { useProjectFiles } from "../store/files";
import { useProjectIndex } from "../store/projectIndex";
import type { FileNode } from "../store/types";
import { useAppStore } from "../store/app";
import { RAIL_ORDER, initialProjectViewState, useProjectView } from "../store/project";
import { useProjects } from "../store/projects";
import { useShallow } from "zustand/react/shallow";

type ProjectProps = {
  projectId: string;
};

/**
 * A tab that comes back: its stores were restored as they were; what changed on disk while
 * it was in the background (another program, a replacement) is brought in now.
 */
function resumeWorkspace(projectId: string) {
  useProjectFiles.getState().loadTree(projectId).catch(notifyError);
  useProjectIndex
    .getState()
    .load(projectId)
    .catch(() => {});
  const paths = Object.keys(useBuffers.getState().buffers);
  void useBuffers
    .getState()
    .applyDiskChanges(paths)
    .then((closed) => closed.forEach((path) => useProjectView.getState().closeFile(path)));
}

/** Every file and folder of the tree. */
const treePaths = (nodes: FileNode[]): string[] =>
  nodes.flatMap((n) => (n.kind === "file" ? [n.path] : [n.path, ...treePaths(n.children)]));

const filePaths = (nodes: FileNode[]): string[] =>
  nodes.flatMap((n) => (n.kind === "file" ? [n.path] : filePaths(n.children)));

/** Stable empty tree (a new `[]` in the selector would re-render forever). */
const NO_FILES: FileNode[] = [];

const storage = typeof window === "undefined" ? undefined : window.localStorage;

/**
 * Runs `next` once the page has drawn a frame (`requestAnimationFrame`, then a task: the
 * frame is painted in between), or after a while if frames don't come (a hidden window).
 * Returns the cleanup.
 */
function afterPaint(next: () => void): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    next();
  };
  let task: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    task = setTimeout(run);
  });
  const fallback = setTimeout(run, 200);
  return () => {
    done = true;
    cancelAnimationFrame(frame);
    clearTimeout(task);
    clearTimeout(fallback);
  };
}

export function Project({ projectId }: ProjectProps) {
  const t = useT();
  const goHome = useAppStore((s) => s.goHome);
  const openProject = useProjects((s) => s.open);
  const current = useProjects((s) => s.current);
  const project = current?.id === projectId ? current : null;
  const { layoutMode, sidePanel, sidePanelOpen, compiler, historyOpen } = useProjectView(
    useShallow(({ layoutMode, sidePanel, sidePanelOpen, compiler, historyOpen }) => ({
      layoutMode,
      sidePanel,
      sidePanelOpen,
      compiler,
      historyOpen,
    })),
  );
  const parsed = useCompile((s) => s.last?.parsed);
  const errorCount = parsed?.errors.length ?? 0;
  const warningCount = parsed?.warnings.length ?? 0;
  const tree = useProjectFiles((s) => (s.projectId === projectId ? s.tree : NO_FILES));

  // Mounted in parts, with a frame drawn between them, so that the «Cargando proyecto» bar can
  // move: first the frame of the view, then the side panel and the editor, then the PDF.
  // Without animations (tests), all at once.
  const [stage, setStage] = useState(() => (canAnimate() ? 0 : 2));
  useEffect(() => {
    if (stage >= 2 || !project) return;
    return afterPaint(() => setStage((s) => s + 1));
  }, [stage, project]);

  // Steps of the loading bar marked here (the editor and the PDF mark their own).
  const treeReady = useProjectFiles((s) => s.projectId === projectId);
  useEffect(() => {
    if (project) useLoading.getState().mark(projectId, "opened");
  }, [project, projectId]);
  useEffect(() => {
    if (treeReady) useLoading.getState().mark(projectId, "files");
  }, [treeReady, projectId]);

  /** The view shows this project's restored tabs: from then on they are remembered. */
  const restored = useRef<string | null>(null);

  /** This tab came back with its stores as they were left (see the layout effect below). */
  const resumed = useRef(false);

  // Another tab's project goes to the background; this one comes back as it was left. Before
  // painting: a tab that comes back is shown at once with what it had (pedido del usuario: se
  // veía «Abriendo proyecto…» al cambiar de pestaña), without waiting for the backend.
  useLayoutEffect(() => {
    resumed.current = activateWorkspace(projectId);
    refreshCompiling();
    if (resumed.current) {
      useProjects.setState((s) => ({
        current: s.projects.find((p) => p.id === projectId) ?? s.current,
      }));
    }
  }, [projectId]);

  // Open the project (records it as recently opened) and reset the view to its main file,
  // or to the tabs and panels of the last session.
  useEffect(() => {
    let cancelled = false;
    restored.current = null;
    openProject(projectId)
      .then((p) => {
        if (cancelled) return;
        getBackend().watchProject(p.id).catch(notifyError);
        if (resumed.current) {
          resumeWorkspace(p.id);
          restored.current = p.id;
          return;
        }
        useBuffers.getState().reset(p.id);
        useSearch.getState().reset();
        useSpell
          .getState()
          .loadPersonal()
          .catch(() => {});
        useCompile.getState().reset(p.id);
        const treeLoaded = useProjectFiles.getState().loadTree(p.id);
        treeLoaded.catch(notifyError);
        useProjectIndex
          .getState()
          .load(p.id)
          .catch(() => {});
        const saved = loadSession(p.id);
        const opening = {
          ...initialProjectViewState,
          openFiles: [p.mainFile],
          activeFile: p.mainFile,
          compiler: p.compiler,
          layoutMode: saved?.layoutMode ?? initialProjectViewState.layoutMode,
          sidePanel: saved?.sidePanel ?? initialProjectViewState.sidePanel,
          sidePanelOpen: saved?.sidePanelOpen ?? initialProjectViewState.sidePanelOpen,
        };
        if (!saved) {
          useProjectView.setState(opening);
          restored.current = p.id;
          return;
        }
        // Nothing of another project meanwhile; then the last session's tabs that still exist.
        useProjectView.setState({ ...opening, openFiles: [], activeFile: null });
        return treeLoaded
          .then(
            () => new Set(filePaths(useProjectFiles.getState().tree)),
            () => new Set<string>(),
          )
          .then((files) => {
            if (cancelled) return;
            useProjectView.setState({
              ...opening,
              ...restoredTabs(saved, (path) => files.has(path), p.mainFile),
            });
            restored.current = p.id;
          });
      })
      .catch((error) => {
        if (cancelled) return;
        notifyError(error);
        // The project is gone (moved, deleted): its tab too.
        void useWorkspaces.getState().close(projectId);
        goHome();
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, openProject, goHome]);

  // Remember the tabs and panels for the next session.
  useEffect(() => {
    const unsubscribe = useProjectView.subscribe((view, previous) => {
      if (restored.current !== projectId) return;
      if (
        view.openFiles === previous.openFiles &&
        view.activeFile === previous.activeFile &&
        view.layoutMode === previous.layoutMode &&
        view.sidePanel === previous.sidePanel &&
        view.sidePanelOpen === previous.sidePanelOpen
      ) {
        return;
      }
      const { openFiles, activeFile, layoutMode, sidePanel, sidePanelOpen } = view;
      rememberView(projectId, { openFiles, activeFile, layoutMode, sidePanel, sidePanelOpen });
    });
    return () => {
      unsubscribe();
      flushSessions();
    };
  }, [projectId]);

  // Compiling is always manual. Ctrl+Enter compiles and Ctrl+J shows the cursor's place in
  // the PDF from anywhere in the project view (inside the editor, CodeMirror's keymap
  // handles them).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isExportPdfKey(e)) {
        e.preventDefault();
        void exportPdf();
      } else if (isProjectSearchKey(e)) {
        e.preventDefault();
        openProjectSearch();
      } else if (isSyncToPdfKey(e)) {
        // SyncTeX to the PDF also when the focus is not in the editor (e.g. after a double
        // click in the PDF).
        e.preventDefault();
        useProjectView.getState().syncToPdf();
      } else if (isCompileKey(e)) {
        e.preventDefault();
        useCompile.getState().compileNow().catch(notifyError);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Compilation events (output and results) of this project.
  useEffect(() => getBackend().onCompileEvent((e) => useCompile.getState().handleEvent(e)), []);

  // Changes made outside JuTeX: refresh the tree and the open files.
  useEffect(() => {
    const backend = getBackend();
    const unsubscribe = backend.onFilesChanged(async (event) => {
      if (event.projectId !== projectId) return;
      // The tree only changes when something appears or disappears; an autosave (or any
      // change of contents) leaves it as it is.
      const known = new Set(treePaths(useProjectFiles.getState().tree));
      if (event.removed.length > 0 || event.paths.some((p) => !known.has(p))) {
        useProjectFiles.getState().loadTree(projectId).catch(notifyError);
      }
      if (event.paths.some((p) => p.endsWith(".tex") || p.endsWith(".bib"))) {
        useProjectIndex
          .getState()
          .load(projectId)
          .catch(() => {});
      }
      const closed = await useBuffers.getState().applyDiskChanges(event.paths);
      for (const path of closed) {
        useProjectView.getState().closeFile(path);
        notifyInfo(
          translate(useI18n.getState().locale, "conflict.deletedToast", {
            name: path.split("/").pop() ?? path,
          }),
        );
      }
    });
    return () => {
      unsubscribe();
      backend.unwatchProject().catch(() => {});
    };
  }, [projectId]);

  const showEditor = layoutMode !== "pdf";
  const showPdf = layoutMode === "split" || layoutMode === "pdf";
  // What is not shown has nothing to load.
  const editorHidden = !showEditor || historyOpen;
  useEffect(() => {
    if (editorHidden) useLoading.getState().mark(projectId, "editor");
    if (!showPdf) useLoading.getState().mark(projectId, "pdf");
  }, [editorHidden, showPdf, projectId]);
  const mainPanelIds = [
    ...(sidePanelOpen ? ["side"] : []),
    ...(showEditor ? ["editor"] : []),
    ...(showPdf ? ["pdf"] : []),
  ];

  const mainLayout = useDefaultLayout({
    id: `jutex:${projectId}:main`,
    panelIds: mainPanelIds,
    storage,
  });
  const sideLayout = useDefaultLayout({ id: `jutex:${projectId}:side`, storage });

  // A side panel comes in from above or below, as on the rail; reopened, from below.
  const sideEntrance = useEntrance(
    sidePanelOpen ? sidePanel : "closed",
    sidePanelOpen ? RAIL_ORDER.indexOf(sidePanel) : -1,
  );
  // The history takes the editor's place coming down, and the editor comes back up.
  const centerEntrance = useEntrance(historyOpen ? "history" : "editor", historyOpen ? 0 : 1);

  const sideContent =
    sidePanel === "files" ? (
      <Group
        orientation="vertical"
        defaultLayout={sideLayout.defaultLayout}
        onLayoutChanged={sideLayout.onLayoutChanged}
      >
        <Panel id="tree" defaultSize="60%" minSize={80}>
          <FileTree nodes={tree} mainFile={project?.mainFile ?? ""} />
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel id="outline" defaultSize="40%" minSize={60}>
          <Outline />
        </Panel>
      </Group>
    ) : sidePanel === "search" ? (
      <SearchPanel />
    ) : sidePanel === "packages" ? (
      <PackagesPanel />
    ) : sidePanel === "backup" ? (
      <BackupPanel />
    ) : (
      <LogsPanel />
    );

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-topbar text-sm text-fg-muted">
        {t("project.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-topbar text-fg">
      <TopBar
        projectName={project.name}
        mainFile={project.mainFile}
        errorCount={errorCount}
        warningCount={warningCount}
      />
      <TexWarning compiler={compiler} />
      <TrustWarning />
      <PasteImageDialog />
      <div className="flex min-h-0 flex-1">
        <IconRail errorCount={errorCount} />
        <Group
          className="min-w-0 flex-1"
          defaultLayout={mainLayout.defaultLayout}
          onLayoutChanged={mainLayout.onLayoutChanged}
        >
          {sidePanelOpen && (
            <>
              <Panel
                id="side"
                defaultSize={260}
                minSize={180}
                maxSize="45%"
                groupResizeBehavior="preserve-pixel-size"
              >
                {/* Each starts when it is drawn (a panel can take a moment to mount). */}
                <div
                  key={sidePanel}
                  ref={holdUntilDrawn}
                  className={`jt-section-${sideEntrance} jt-hold h-full`}
                >
                  {stage >= 1 && sideContent}
                </div>
              </Panel>
              <ResizeHandle />
            </>
          )}
          {showEditor && (
            <Panel id="editor" minSize={300}>
              <div
                key={historyOpen ? "history" : "editor"}
                ref={holdUntilDrawn}
                className={`jt-section-${centerEntrance} jt-hold h-full`}
              >
                {stage >= 1 && (historyOpen ? <HistoryPane /> : <EditorPane />)}
              </div>
            </Panel>
          )}
          {showEditor && showPdf && <ResizeHandle />}
          {showPdf && (
            <Panel id="pdf" minSize={260}>
              {stage >= 2 && <PdfPane />}
            </Panel>
          )}
        </Group>
      </div>
      <ConflictDialog />
    </div>
  );
}

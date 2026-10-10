import { useEffect } from "react";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { EditorPane } from "../components/editor/EditorPane";
import { FileTree } from "../components/filetree/FileTree";
import { IconRail } from "../components/layout/IconRail";
import { ResizeHandle } from "../components/layout/ResizeHandle";
import { SidePlaceholder } from "../components/layout/SidePlaceholder";
import { TexWarning } from "../components/compile/TexWarning";
import { LogsPanel } from "../components/logs/LogsPanel";
import { TopBar } from "../components/layout/TopBar";
import { Outline } from "../components/outline/Outline";
import { PdfPane } from "../components/pdf/PdfPane";
import { translate, useI18n, useT } from "../i18n";
import { notifyError } from "../lib/errors";
import { getBackend } from "../lib/tauri";
import { notifyInfo } from "../lib/errors";
import { ConflictDialog } from "../components/editor/ConflictDialog";
import { useBuffers } from "../store/buffers";
import { useCompile } from "../store/compile";
import { useProjectFiles } from "../store/files";
import { useProjectIndex } from "../store/projectIndex";
import type { FileNode } from "../store/types";
import { useAppStore } from "../store/app";
import { initialProjectViewState, useProjectView } from "../store/project";
import { useProjects } from "../store/projects";

type ProjectProps = {
  projectId: string;
};

/** Stable empty tree (a new `[]` in the selector would re-render forever). */
const NO_FILES: FileNode[] = [];

const storage = typeof window === "undefined" ? undefined : window.localStorage;

export function Project({ projectId }: ProjectProps) {
  const t = useT();
  const goHome = useAppStore((s) => s.goHome);
  const openProject = useProjects((s) => s.open);
  const current = useProjects((s) => s.current);
  const project = current?.id === projectId ? current : null;
  const { layoutMode, sidePanel, sidePanelOpen, compiler } = useProjectView();
  const parsed = useCompile((s) => s.last?.parsed);
  const errorCount = parsed?.errors.length ?? 0;
  const warningCount = parsed?.warnings.length ?? 0;
  const tree = useProjectFiles((s) => (s.projectId === projectId ? s.tree : NO_FILES));

  // Open the project (records it as recently opened) and reset the view to its main file.
  useEffect(() => {
    let cancelled = false;
    openProject(projectId)
      .then((p) => {
        if (cancelled) return;
        useBuffers.getState().reset(p.id);
        useCompile.getState().reset(p.id);
        useProjectFiles.getState().loadTree(p.id).catch(notifyError);
        useProjectIndex
          .getState()
          .load(p.id)
          .catch(() => {});
        getBackend().watchProject(p.id).catch(notifyError);
        useProjectView.setState({
          ...initialProjectViewState,
          openFiles: [p.mainFile],
          activeFile: p.mainFile,
          compiler: p.compiler,
          autoCompile: initialProjectViewState.autoCompile,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        notifyError(error);
        goHome();
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, openProject, goHome]);

  // Compilation events (output and results) of this project.
  useEffect(() => getBackend().onCompileEvent((e) => useCompile.getState().handleEvent(e)), []);

  // Changes made outside LibreTeX: refresh the tree and the open files.
  useEffect(() => {
    const backend = getBackend();
    const unsubscribe = backend.onFilesChanged(async (event) => {
      if (event.projectId !== projectId) return;
      useProjectFiles.getState().loadTree(projectId).catch(notifyError);
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
  const mainPanelIds = [
    ...(sidePanelOpen ? ["side"] : []),
    ...(showEditor ? ["editor"] : []),
    ...(showPdf ? ["pdf"] : []),
  ];

  const mainLayout = useDefaultLayout({
    id: `libretex:${projectId}:main`,
    panelIds: mainPanelIds,
    storage,
  });
  const sideLayout = useDefaultLayout({ id: `libretex:${projectId}:side`, storage });

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
      <SidePlaceholder
        title={t("rail.search")}
        description={t("common.availableInPhase", { phase: 9 })}
      />
    ) : sidePanel === "packages" ? (
      <SidePlaceholder
        title={t("rail.packages")}
        description={t("common.availableInPhase", { phase: 8 })}
      />
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
                {sideContent}
              </Panel>
              <ResizeHandle />
            </>
          )}
          {showEditor && (
            <Panel id="editor" minSize={300}>
              <EditorPane />
            </Panel>
          )}
          {showEditor && showPdf && <ResizeHandle />}
          {showPdf && (
            <Panel id="pdf" minSize={260}>
              <PdfPane />
            </Panel>
          )}
        </Group>
      </div>
      <ConflictDialog />
    </div>
  );
}

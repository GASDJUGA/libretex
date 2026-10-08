import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { EditorPane } from "../components/editor/EditorPane";
import { FileTree } from "../components/filetree/FileTree";
import { IconRail } from "../components/layout/IconRail";
import { ResizeHandle } from "../components/layout/ResizeHandle";
import { SidePlaceholder } from "../components/layout/SidePlaceholder";
import { TopBar } from "../components/layout/TopBar";
import { Outline } from "../components/outline/Outline";
import { PdfPane } from "../components/pdf/PdfPane";
import { mockFileTree, mockMainFile, mockOutline } from "../mocks/projectFiles";
import { mockProjects } from "../mocks/projects";
import { useProjectView } from "../store/project";

type ProjectProps = {
  projectId: string;
};

// Sample diagnostics for the skeleton.
const errorCount = 1;
const warningCount = 3;
const cursorLine = 40;

const storage = typeof window === "undefined" ? undefined : window.localStorage;

export function Project({ projectId }: ProjectProps) {
  const project = mockProjects.find((p) => p.id === projectId);
  const { layoutMode, sidePanel, sidePanelOpen } = useProjectView();

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
          <FileTree nodes={mockFileTree} mainFile={mockMainFile} />
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel id="outline" defaultSize="40%" minSize={60}>
          <Outline items={mockOutline} cursorLine={cursorLine} />
        </Panel>
      </Group>
    ) : sidePanel === "search" ? (
      <SidePlaceholder title="Buscar en el proyecto" description="Disponible en la Fase 9." />
    ) : sidePanel === "packages" ? (
      <SidePlaceholder title="Paquetes" description="Disponible en la Fase 8." />
    ) : (
      <SidePlaceholder title="Registros y errores" description="Disponible en la Fase 5." />
    );

  return (
    <div className="flex h-full flex-col bg-topbar text-fg">
      <TopBar projectName={project?.name ?? projectId} mainFile={mockMainFile} />
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
              <EditorPane cursorLine={cursorLine} />
            </Panel>
          )}
          {showEditor && showPdf && <ResizeHandle />}
          {showPdf && (
            <Panel id="pdf" minSize={260}>
              <PdfPane errorCount={errorCount} warningCount={warningCount} />
            </Panel>
          )}
        </Group>
      </div>
    </div>
  );
}

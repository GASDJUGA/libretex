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
import { useT } from "../i18n";

type ProjectProps = {
  projectId: string;
};

// Sample diagnostics for the skeleton.
const errorCount = 1;
const warningCount = 3;
const cursorLine = 40;

const storage = typeof window === "undefined" ? undefined : window.localStorage;

export function Project({ projectId }: ProjectProps) {
  const t = useT();
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
      <SidePlaceholder
        title={t("rail.logs")}
        description={t("common.availableInPhase", { phase: 5 })}
      />
    );

  return (
    <div className="flex h-full flex-col bg-topbar text-fg">
      <TopBar
        projectName={project?.name ?? projectId}
        mainFile={mockMainFile}
        errorCount={errorCount}
        warningCount={warningCount}
      />
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
              <PdfPane />
            </Panel>
          )}
        </Group>
      </div>
    </div>
  );
}

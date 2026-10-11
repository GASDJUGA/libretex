import { ChevronDown, Columns2, Download, History } from "lucide-react";
import { compilerLabels } from "../../mocks/projects";
import { runCommand, runViewCommand } from "../../editor/activeView";
import {
  bold,
  bulletList,
  cite,
  displayMath,
  figure,
  find,
  inlineMath,
  italic,
  link,
  numberedList,
  redo,
  ref,
  setHeading,
  table,
  toggleComment,
  undo,
} from "../../editor/commands";
import { notifyError } from "../../lib/errors";
import { useAppStore } from "../../store/app";
import { useBuffers } from "../../store/buffers";
import { useSettings, type IndentMode } from "../../store/settings";
import { useProjectView, type LayoutMode } from "../../store/project";
import { CompileButton } from "../compile/CompileButton";
import { Logo } from "../common/Logo";
import { Menu, type MenuEntry } from "../common/Menu";
import { useT } from "../../i18n";

type TopBarProps = {
  projectName: string;
  mainFile: string;
  errorCount: number;
  warningCount: number;
};

const sep = { kind: "separator" } as const;

export function TopBar({ projectName, mainFile, errorCount, warningCount }: TopBarProps) {
  const t = useT();
  const {
    indentMode,
    setIndentMode,
    liveCheck,
    setLiveCheck,
    mathPreview,
    setMathPreview,
    mathPreviewHover,
    setMathPreviewHover,
  } = useSettings();
  const goHome = useAppStore((s) => s.goHome);
  const {
    layoutMode,
    setLayoutMode,
    compiler,
    setCompiler,
    sidePanelOpen,
    setSidePanelOpen,
    activeFile,
    editorActive,
    requestTree,
  } = useProjectView();

  const layoutEntries = (
    [
      ["split", t("layout.split")],
      ["editor", t("layout.editor")],
      ["pdf", t("layout.pdf")],
    ] as [LayoutMode, string][]
  ).map(([mode, label]): MenuEntry => ({
    label,
    checked: layoutMode === mode,
    radio: true,
    onSelect: () => setLayoutMode(mode),
  }));
  layoutEntries.push({
    label: t("layout.detached"),
    disabled: true,
    hint: t("common.comingSoon"),
  });

  const soon = { disabled: true, hint: t("common.comingSoon") };
  /** Editing entries only work while a text file is shown in the editor. */
  const edit = (label: string, onSelect: () => void, shortcut?: string): MenuEntry => ({
    label,
    shortcut,
    disabled: !editorActive,
    onSelect,
  });
  const saveActive = () => {
    if (activeFile) useBuffers.getState().save(activeFile).catch(notifyError);
  };

  const menus: [string, MenuEntry[]][] = [
    [
      t("menu.file"),
      [
        { label: t("menu.newFile"), onSelect: () => requestTree("newFile") },
        { label: t("menu.newFolder"), onSelect: () => requestTree("newFolder") },
        { label: t("menu.uploadFiles"), onSelect: () => requestTree("upload") },
        sep,
        { label: t("menu.save"), shortcut: "Ctrl+S", disabled: !activeFile, onSelect: saveActive },
        { label: t("menu.compile"), shortcut: "Ctrl+Enter", ...soon },
        sep,
        { label: t("menu.exportPdf"), ...soon },
        { label: t("menu.exportZip"), ...soon },
        sep,
        { label: t("common.backHome"), onSelect: () => goHome() },
      ],
    ],
    [
      t("menu.edit"),
      [
        edit(t("menu.undo"), () => runViewCommand(undo), "Ctrl+Z"),
        edit(t("menu.redo"), () => runViewCommand(redo), "Ctrl+Shift+Z"),
        sep,
        edit(t("menu.toggleComment"), () => runViewCommand(toggleComment), "Ctrl+/"),
        sep,
        edit(t("menu.findReplace"), () => runViewCommand(find), "Ctrl+F"),
        { label: t("menu.findInProject"), shortcut: "Ctrl+Shift+F", ...soon },
      ],
    ],
    [
      t("menu.insert"),
      [
        edit(t("menu.inlineMath"), () => runCommand(inlineMath)),
        edit(t("menu.displayMath"), () => runCommand(displayMath)),
        sep,
        edit(t("menu.figure"), () => runCommand(figure)),
        edit(t("menu.table"), () => runCommand(table(3, 3))),
        edit(t("menu.bulletList"), () => runCommand(bulletList)),
        edit(t("menu.numberedList"), () => runCommand(numberedList)),
        sep,
        edit(t("menu.link"), () => runCommand(link)),
        edit(t("menu.ref"), () => runCommand(ref)),
        edit(t("menu.cite"), () => runCommand(cite)),
      ],
    ],
    [
      t("menu.view"),
      [
        ...layoutEntries,
        sep,
        { kind: "label", label: t("menu.indent") },
        ...(
          [
            ["environments", t("settings.indentEnvironments")],
            ["full", t("settings.indentFull")],
            ["none", t("settings.indentNone")],
          ] as [IndentMode, string][]
        ).map(([mode, label]): MenuEntry => ({
          label,
          checked: indentMode === mode,
          radio: true,
          onSelect: () => setIndentMode(mode),
        })),
        sep,
        {
          label: t("settings.liveCheck"),
          checked: liveCheck,
          onSelect: () => setLiveCheck(!liveCheck),
        },
        {
          label: t("settings.mathPreview"),
          checked: mathPreview,
          onSelect: () => setMathPreview(!mathPreview),
        },
        {
          label: t("settings.mathPreviewHover"),
          checked: mathPreviewHover,
          disabled: !mathPreview,
          onSelect: () => setMathPreviewHover(!mathPreviewHover),
        },
        sep,
        {
          label: t("pdf.syncToPdf"),
          shortcut: "Ctrl+J",
          onSelect: () => useProjectView.getState().syncToPdf(),
        },
        sep,
        {
          label: t("menu.sidePanel"),
          checked: sidePanelOpen,
          onSelect: () => setSidePanelOpen(!sidePanelOpen),
        },
      ],
    ],
    [
      t("menu.format"),
      [
        edit(t("menu.bold"), () => runCommand(bold), "Ctrl+B"),
        edit(t("menu.italic"), () => runCommand(italic), "Ctrl+I"),
        sep,
        edit(t("menu.section"), () => runCommand(setHeading("section"))),
        edit(t("menu.subsection"), () => runCommand(setHeading("subsection"))),
        edit(t("menu.subsubsection"), () => runCommand(setHeading("subsubsection"))),
      ],
    ],
    [
      t("menu.help"),
      [
        { label: t("menu.shortcuts"), ...soon },
        { label: t("menu.latexDocs"), ...soon },
        sep,
        { label: t("menu.about"), ...soon },
      ],
    ],
  ];

  const projectEntries: MenuEntry[] = [
    { label: t("project.rename") },
    { label: t("project.settings") },
    sep,
    { kind: "label", label: t("project.mainFile") },
    { label: mainFile, checked: true, radio: true },
    sep,
    { kind: "label", label: t("project.compiler") },
    ...(Object.keys(compilerLabels) as (keyof typeof compilerLabels)[]).map((c): MenuEntry => ({
      label: compilerLabels[c],
      checked: compiler === c,
      radio: true,
      onSelect: () => setCompiler(c),
    })),
  ];

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-1 border-b border-black/30 bg-topbar px-2">
      <button
        type="button"
        onClick={() => goHome()}
        title={t("common.backHome")}
        aria-label={t("common.backHome")}
        className="mr-1 rounded p-1 hover:bg-hover"
      >
        <Logo size={26} />
      </button>

      <nav aria-label={t("menu.mainMenu")} className="flex items-center">
        {menus.map(([label, entries]) => (
          <Menu key={label} trigger={label} entries={entries} />
        ))}
      </nav>

      <div className="absolute left-1/2 -translate-x-1/2">
        <Menu
          trigger={
            <>
              <span className="max-w-80 truncate font-medium">{projectName}</span>
              <ChevronDown size={14} aria-hidden />
            </>
          }
          label={t("project.menuLabel", { name: projectName })}
          entries={projectEntries}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <CompileButton errorCount={errorCount} warningCount={warningCount} />
        <span className="mx-1 h-5 border-l border-line" />
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded px-2 text-sm hover:bg-hover"
        >
          <History size={16} aria-hidden /> {t("project.history")}
        </button>
        <Menu
          trigger={
            <>
              <Columns2 size={16} aria-hidden /> {t("layout.title")}{" "}
              <ChevronDown size={14} aria-hidden />
            </>
          }
          entries={layoutEntries}
          align="end"
        />
        <Menu
          trigger={
            <>
              <Download size={16} aria-hidden /> {t("project.export")}
            </>
          }
          entries={[
            { label: t("project.exportPdf"), shortcut: "Ctrl+Shift+S" },
            { label: t("project.exportZip") },
          ]}
          align="end"
          triggerClassName="flex h-8 items-center gap-1.5 rounded bg-panel-raised px-3 text-sm hover:bg-hover"
        />
      </div>
    </header>
  );
}

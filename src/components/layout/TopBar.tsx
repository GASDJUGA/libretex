import { ChevronDown, Download } from "lucide-react";
import { useMemo, useState } from "react";
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
import { IS_MAC, keyLabel } from "../../lib/platform";
import { useAppStore } from "../../store/app";
import { useBuffers } from "../../store/buffers";
import { useCompile } from "../../store/compile";
import { useSettings, type IndentMode } from "../../store/settings";
import { useProjectView } from "../../store/project";
import { useLayoutEntries } from "./useLayoutEntries";
import { CompileButton } from "../compile/CompileButton";
import { Menu, type MenuEntry } from "../common/Menu";
import { useI18n, useT } from "../../i18n";
import { getBackend } from "../../lib/tauri";
import { useHelp } from "../../store/help";
import { useProjectFiles } from "../../store/files";
import type { FileNode } from "../../store/types";
import { RenameDialog } from "../home/ProjectDialogs";
import { FiguresFolderDialog } from "./FiguresFolderDialog";
import { openProjectSearch } from "../../store/search";
import { useSpell } from "../../store/spell";
import { useProjects } from "../../store/projects";
import { SaveVersionDialog } from "../history/SaveVersionDialog";
import { exportPdf, exportZip } from "../../lib/export";

type TopBarProps = {
  projectName: string;
  mainFile: string;
  errorCount: number;
  warningCount: number;
};

const sep = { kind: "separator" } as const;

/** Files offered as main file: the current one and the other `.tex` (at most 20). */
function mainFileChoices(texFiles: string[], mainFile: string): string[] {
  const others = texFiles.filter((p) => p !== mainFile).slice(0, 19);
  return [mainFile, ...others].sort((a, b) => a.localeCompare(b));
}

function collectTex(nodes: FileNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === "folder") collectTex(node.children, out);
    else if (/\.(tex|ltx)$/i.test(node.name)) out.push(node.path);
  }
  return out;
}

export function TopBar({ projectName, mainFile, errorCount, warningCount }: TopBarProps) {
  const [savingVersion, setSavingVersion] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [choosingFigures, setChoosingFigures] = useState(false);
  const tree = useProjectFiles((s) => s.tree);
  const texFiles = useMemo(() => collectTex(tree), [tree]);
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
  const spellLang = useProjects((s) => s.current?.spellLang ?? "es");
  const goHome = useAppStore((s) => s.goHome);
  const {
    compiler,
    setCompiler,
    sidePanelOpen,
    setSidePanelOpen,
    activeFile,
    editorActive,
    requestTree,
  } = useProjectView();

  const layoutEntries = useLayoutEntries();

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
        {
          label: t("menu.save"),
          shortcut: keyLabel("Mod+S"),
          disabled: !activeFile,
          onSelect: saveActive,
        },
        {
          label: t("menu.compile"),
          shortcut: keyLabel("Mod+Enter"),
          onSelect: () => useCompile.getState().compileNow().catch(notifyError),
        },
        { label: t("history.saveVersion"), onSelect: () => setSavingVersion(true) },
        sep,
        {
          label: t("menu.exportPdf"),
          shortcut: keyLabel("Mod+Shift+S"),
          onSelect: () => void exportPdf(),
        },
        { label: t("menu.exportZip"), onSelect: () => void exportZip() },
        sep,
        { label: t("common.backHome"), onSelect: () => goHome() },
      ],
    ],
    [
      t("menu.edit"),
      [
        edit(t("menu.undo"), () => runViewCommand(undo), keyLabel("Mod+Z")),
        edit(t("menu.redo"), () => runViewCommand(redo), keyLabel("Mod+Shift+Z")),
        sep,
        edit(t("menu.toggleComment"), () => runViewCommand(toggleComment), keyLabel("Mod+/")),
        sep,
        edit(t("menu.findReplace"), () => runViewCommand(find), keyLabel("Mod+F")),
        {
          label: t("menu.findInProject"),
          shortcut: keyLabel("Mod+Shift+F"),
          onSelect: openProjectSearch,
        },
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
        { kind: "label", label: t("spell.language") },
        ...(["es", "en", "off"] as const).map((lang) => ({
          label: t(`spell.${lang}`),
          checked: spellLang === lang,
          radio: true,
          onSelect: () => void useSpell.getState().setLanguage(lang).catch(notifyError),
        })),
        sep,
        {
          label: t("pdf.syncToPdf"),
          shortcut: keyLabel("Mod+J"),
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
        edit(t("menu.bold"), () => runCommand(bold), keyLabel("Mod+B")),
        edit(t("menu.italic"), () => runCommand(italic), keyLabel("Mod+I")),
        sep,
        edit(t("menu.section"), () => runCommand(setHeading("section"))),
        edit(t("menu.subsection"), () => runCommand(setHeading("subsection"))),
        edit(t("menu.subsubsection"), () => runCommand(setHeading("subsubsection"))),
      ],
    ],
    [
      t("menu.help"),
      [
        {
          label: t("menu.shortcuts"),
          shortcut: "F1",
          onSelect: () => useHelp.getState().show("shortcuts"),
        },
        {
          label: t("menu.latexDocs"),
          hint: t("menu.opensBrowser"),
          onSelect: () =>
            void getBackend().openHelpLink("latex", useI18n.getState().locale).catch(notifyError),
        },
        sep,
        { label: t("menu.about"), onSelect: () => useHelp.getState().show("about") },
      ],
    ],
  ];

  const project = useProjects.getState().current;
  const projectEntries: MenuEntry[] = [
    { label: t("project.rename"), onSelect: () => setRenaming(true) },
    {
      label: t(IS_MAC ? "projects.revealFinder" : "projects.reveal"),
      onSelect: () => {
        if (project) useProjects.getState().reveal(project.id).catch(notifyError);
      },
    },
    { label: t("project.figuresFolder"), onSelect: () => setChoosingFigures(true) },
    sep,
    { kind: "label", label: t("project.mainFile") },
    ...mainFileChoices(texFiles, mainFile).map((path): MenuEntry => ({
      label: path,
      checked: path === mainFile,
      radio: true,
      onSelect: () => {
        if (project && path !== mainFile) {
          useProjects.getState().setMainFile(project.id, path).catch(notifyError);
        }
      },
    })),
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
    <>
      <header className="relative flex h-11 shrink-0 items-center gap-1 border-b border-black/30 bg-topbar px-2">
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
          <Menu
            trigger={
              <>
                <Download size={16} aria-hidden /> {t("project.export")}
              </>
            }
            entries={[
              {
                label: t("project.exportPdf"),
                shortcut: keyLabel("Mod+Shift+S"),
                onSelect: () => void exportPdf(),
              },
              { label: t("project.exportZip"), onSelect: () => void exportZip() },
            ]}
            align="end"
            triggerClassName="flex h-8 items-center gap-1.5 rounded bg-panel-raised px-3 text-sm hover:bg-hover"
          />
        </div>
      </header>
      {savingVersion && <SaveVersionDialog onClose={() => setSavingVersion(false)} />}
      {renaming && project && <RenameDialog project={project} onClose={() => setRenaming(false)} />}
      {choosingFigures && project && (
        <FiguresFolderDialog project={project} onClose={() => setChoosingFigures(false)} />
      )}
    </>
  );
}

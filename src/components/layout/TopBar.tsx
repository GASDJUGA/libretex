import { ChevronDown, Columns2, Download, History } from "lucide-react";
import { compilerLabels } from "../../mocks/projects";
import { useAppStore } from "../../store/app";
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
  const goHome = useAppStore((s) => s.goHome);
  const { layoutMode, setLayoutMode, compiler, setCompiler, sidePanelOpen, setSidePanelOpen } =
    useProjectView();

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

  const menus: [string, MenuEntry[]][] = [
    [
      t("menu.file"),
      [
        { label: t("menu.newFile") },
        { label: t("menu.newFolder") },
        { label: t("menu.uploadFiles") },
        sep,
        { label: t("menu.save"), shortcut: "Ctrl+S" },
        { label: t("menu.compile"), shortcut: "Ctrl+Enter" },
        sep,
        { label: t("menu.exportPdf") },
        { label: t("menu.exportZip") },
        sep,
        { label: t("common.backHome"), onSelect: () => goHome() },
      ],
    ],
    [
      t("menu.edit"),
      [
        { label: t("menu.undo"), shortcut: "Ctrl+Z" },
        { label: t("menu.redo"), shortcut: "Ctrl+Shift+Z" },
        sep,
        { label: t("menu.toggleComment"), shortcut: "Ctrl+/" },
        sep,
        { label: t("menu.findReplace"), shortcut: "Ctrl+F" },
        { label: t("menu.findInProject"), shortcut: "Ctrl+Shift+F" },
      ],
    ],
    [
      t("menu.insert"),
      [
        { label: t("menu.inlineMath") },
        { label: t("menu.displayMath") },
        { label: t("menu.symbol") },
        sep,
        { label: t("menu.figure") },
        { label: t("menu.table") },
        { label: t("menu.bulletList") },
        { label: t("menu.numberedList") },
        sep,
        { label: t("menu.link") },
        { label: t("menu.ref") },
        { label: t("menu.cite") },
      ],
    ],
    [
      t("menu.view"),
      [
        ...layoutEntries,
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
        { label: t("menu.bold"), shortcut: "Ctrl+B" },
        { label: t("menu.italic"), shortcut: "Ctrl+I" },
        sep,
        { label: t("menu.section") },
        { label: t("menu.subsection") },
        { label: t("menu.subsubsection") },
      ],
    ],
    [
      t("menu.help"),
      [
        { label: t("menu.shortcuts") },
        { label: t("menu.latexDocs") },
        sep,
        { label: t("menu.about") },
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

import {
  Bold,
  Hash,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Omega,
  Quote,
  Radical,
  Redo2,
  Search,
  SquareSigma,
  Table,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useProjectView } from "../../store/project";
import { useT, type TranslationKey } from "../../i18n";

type Tool = [label: TranslationKey, Icon: LucideIcon, shortcut?: string];

const groups: Tool[][] = [
  [
    ["editor.tools.undo", Undo2, "Ctrl+Z"],
    ["editor.tools.redo", Redo2, "Ctrl+Shift+Z"],
  ],
  [
    ["editor.tools.bold", Bold, "Ctrl+B"],
    ["editor.tools.italic", Italic, "Ctrl+I"],
  ],
  [
    ["editor.tools.inlineMath", Radical],
    ["editor.tools.displayMath", SquareSigma],
    ["editor.tools.symbols", Omega],
  ],
  [
    ["editor.tools.link", Link],
    ["editor.tools.ref", Hash],
    ["editor.tools.cite", Quote],
  ],
  [
    ["editor.tools.figure", ImagePlus],
    ["editor.tools.table", Table],
    ["editor.tools.bulletList", List],
    ["editor.tools.numberedList", ListOrdered],
  ],
  [["editor.tools.findReplace", Search, "Ctrl+F"]],
];

const headingLevels = ["normal", "section", "subsection", "subsubsection", "paragraph"] as const;

export function EditorToolbar() {
  const t = useT();
  const editorMode = useProjectView((s) => s.editorMode);

  return (
    <div
      role="toolbar"
      aria-label={t("editor.toolbar")}
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2"
    >
      <div
        role="radiogroup"
        aria-label={t("editor.mode")}
        className="mr-1 flex shrink-0 rounded bg-topbar p-0.5 text-xs"
      >
        <button
          type="button"
          role="radio"
          aria-checked={editorMode === "code"}
          className="rounded px-2.5 py-1 font-medium aria-checked:bg-accent aria-checked:text-accent-fg"
        >
          {t("editor.code")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={editorMode === "visual"}
          disabled
          title={t("common.comingSoon")}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-fg-muted"
        >
          {t("editor.visual")}
          <span className="rounded bg-panel-raised px-1 text-[10px]">{t("common.comingSoon")}</span>
        </button>
      </div>

      {groups.map((group, i) => (
        <div key={i} className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
          {i === 1 && (
            <select
              aria-label={t("editor.headingLevel")}
              defaultValue="normal"
              className="mr-1 h-7 rounded border border-line bg-topbar px-1 text-xs text-fg"
            >
              {headingLevels.map((h) => (
                <option key={h} value={h}>
                  {t(`editor.headings.${h}`)}
                </option>
              ))}
            </select>
          )}
          {group.map(([key, Icon, shortcut]) => (
            <button
              key={key}
              type="button"
              title={shortcut ? `${t(key)} (${shortcut})` : t(key)}
              aria-label={t(key)}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
            >
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

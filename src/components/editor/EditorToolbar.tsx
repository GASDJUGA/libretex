import { EditorState } from "@codemirror/state";
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
import { useState } from "react";
import { getActiveView, runCommand, runViewCommand } from "../../editor/activeView";
import {
  bold,
  bulletList,
  cite,
  displayMath,
  figure,
  find,
  headingAt,
  inlineMath,
  insertSymbol,
  italic,
  link,
  numberedList,
  redo,
  ref,
  setHeading,
  table,
  undo,
  type HeadingLevel,
} from "../../editor/commands";
import { symbolGroups } from "../../editor/symbols";
import { useT, type TranslationKey } from "../../i18n";
import { keyLabel } from "../../lib/platform";
import { useProjectView } from "../../store/project";
import { Popover } from "../common/Popover";

type Tool = {
  label: TranslationKey;
  Icon: LucideIcon;
  shortcut?: string;
  action: () => void;
};

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg";

const headingLevels: HeadingLevel[] = [
  "normal",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
];

const TABLE_MAX = { rows: 8, cols: 8 };

export function EditorToolbar() {
  const t = useT();
  const editorMode = useProjectView((s) => s.editorMode);
  const enabled = useProjectView((s) => s.editorActive);
  // Re-render when the cursor changes line, so the heading selector follows it.
  useProjectView((s) => s.cursorLine);
  const view = getActiveView();
  const heading = headingAt(view?.state ?? EditorState.create());

  const tool = (
    label: TranslationKey,
    Icon: LucideIcon,
    action: () => void,
    shortcut?: string,
  ): Tool => ({
    label,
    Icon,
    action,
    shortcut,
  });

  const groups: (Tool | "symbols" | "table")[][] = [
    [
      tool("editor.tools.undo", Undo2, () => runViewCommand(undo), keyLabel("Mod+Z")),
      tool("editor.tools.redo", Redo2, () => runViewCommand(redo), keyLabel("Mod+Shift+Z")),
    ],
    [
      tool("editor.tools.bold", Bold, () => runCommand(bold), keyLabel("Mod+B")),
      tool("editor.tools.italic", Italic, () => runCommand(italic), keyLabel("Mod+I")),
    ],
    [
      tool("editor.tools.inlineMath", Radical, () => runCommand(inlineMath)),
      tool("editor.tools.displayMath", SquareSigma, () => runCommand(displayMath)),
      "symbols",
    ],
    [
      tool("editor.tools.link", Link, () => runCommand(link)),
      tool("editor.tools.ref", Hash, () => runCommand(ref)),
      tool("editor.tools.cite", Quote, () => runCommand(cite)),
    ],
    [
      tool("editor.tools.figure", ImagePlus, () => runCommand(figure)),
      "table",
      tool("editor.tools.bulletList", List, () => runCommand(bulletList)),
      tool("editor.tools.numberedList", ListOrdered, () => runCommand(numberedList)),
    ],
    [tool("editor.tools.findReplace", Search, () => runViewCommand(find), keyLabel("Mod+F"))],
  ];

  return (
    <div
      role="toolbar"
      aria-label={t("editor.toolbar")}
      className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-line bg-panel px-2 py-1.5"
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
          aria-describedby="visual-mode-soon"
          disabled
          title={t("common.comingSoon")}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-fg-muted"
        >
          {t("editor.visual")}
          <span
            id="visual-mode-soon"
            aria-hidden
            className="rounded bg-panel-raised px-1 text-[10px]"
          >
            {t("common.comingSoon")}
          </span>
        </button>
      </div>

      {groups.map((group, i) => (
        <div key={i} className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
          {i === 1 && (
            <select
              aria-label={t("editor.headingLevel")}
              value={heading}
              disabled={!enabled}
              onChange={(e) => runCommand(setHeading(e.target.value as HeadingLevel))}
              className="mr-1 h-7 rounded border border-line bg-topbar px-1 text-xs text-fg"
            >
              {headingLevels.map((h) => (
                <option key={h} value={h}>
                  {t(`editor.headings.${h}`)}
                </option>
              ))}
            </select>
          )}
          {group.map((item) =>
            item === "symbols" ? (
              <SymbolPalette key="symbols" />
            ) : item === "table" ? (
              <TablePicker key="table" />
            ) : (
              <button
                key={item.label}
                type="button"
                title={item.shortcut ? `${t(item.label)} (${item.shortcut})` : t(item.label)}
                aria-label={t(item.label)}
                aria-keyshortcuts={item.shortcut}
                onMouseDown={(e) => e.preventDefault() /* keep the editor's selection */}
                onClick={item.action}
                disabled={!enabled}
                className={`${iconButton} disabled:opacity-40 disabled:hover:bg-transparent`}
              >
                <item.Icon size={16} aria-hidden />
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function SymbolPalette() {
  const t = useT();
  return (
    <Popover
      label={t("editor.tools.symbols")}
      trigger={<Omega size={16} aria-hidden />}
      triggerClassName={iconButton}
    >
      {(close) => (
        <div className="flex max-h-96 w-80 flex-col gap-2 overflow-y-auto">
          {symbolGroups.map((group) => (
            <section key={group.id} aria-label={t(`editor.symbolGroups.${group.id}`)}>
              <h3 className="mb-1 text-xs font-semibold text-fg-muted uppercase">
                {t(`editor.symbolGroups.${group.id}`)}
              </h3>
              <div className="grid grid-cols-8 gap-0.5">
                {group.symbols.map(([command, char]) => (
                  <button
                    key={command}
                    type="button"
                    title={command}
                    aria-label={command}
                    onClick={() => {
                      runCommand(insertSymbol(command));
                      close();
                    }}
                    className="flex h-8 items-center justify-center rounded text-base hover:bg-hover"
                  >
                    {char}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Popover>
  );
}

function TablePicker() {
  const t = useT();
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  return (
    <Popover
      label={t("editor.tools.table")}
      trigger={<Table size={16} aria-hidden />}
      triggerClassName={iconButton}
    >
      {(close) => (
        <div className="flex flex-col gap-2" onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
          <p className="text-xs text-fg-muted">
            {hover.rows
              ? t("editor.tableSize", { rows: hover.rows, cols: hover.cols })
              : t("editor.tablePick")}
          </p>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${TABLE_MAX.cols}, 1.25rem)` }}
          >
            {Array.from({ length: TABLE_MAX.rows }, (_, r) =>
              Array.from({ length: TABLE_MAX.cols }, (_, c) => {
                const rows = r + 1;
                const cols = c + 1;
                const lit = rows <= hover.rows && cols <= hover.cols;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    aria-label={t("editor.tableSize", { rows, cols })}
                    onMouseEnter={() => setHover({ rows, cols })}
                    onFocus={() => setHover({ rows, cols })}
                    onClick={() => {
                      runCommand(table(rows, cols));
                      close();
                    }}
                    className={`h-5 w-5 rounded-sm border ${
                      lit ? "border-accent bg-accent/40" : "border-line bg-panel"
                    }`}
                  />
                );
              }),
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

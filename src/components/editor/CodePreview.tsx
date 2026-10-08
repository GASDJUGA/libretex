import { Fragment, type ReactNode } from "react";
import { useT } from "../../i18n";

type CodePreviewProps = {
  source: string;
  activeLine: number;
};

const token = /(%.*$)|(\\[a-zA-Z@]+\*?|\\.)|(\$[^$]*\$)|([{}[\]])/g;

/** Light-weight colouring of a LaTeX line; a stand-in until CodeMirror arrives in Phase 4. */
function highlight(line: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(token)) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const cls = m[1]
      ? "text-[#6a737d] italic"
      : m[2]
        ? "text-[#0550ae]"
        : m[3]
          ? "text-[#953800]"
          : "text-[#8250df]";
    parts.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}

/**
 * Read-only stand-in for the code editor in the UI skeleton (Phase 1).
 * Replaced by CodeMirror 6 in Phase 4.
 */
export function CodePreview({ source, activeLine }: CodePreviewProps) {
  const t = useT();
  const lines = source.split("\n");

  return (
    <div
      className="h-full overflow-auto bg-editor font-mono text-[13px] leading-5 text-editor-fg select-text"
      aria-label={t("editor.source")}
    >
      <div className="grid min-w-max grid-cols-[auto_1fr]">
        {lines.map((line, i) => {
          const n = i + 1;
          const active = n === activeLine;
          return (
            <Fragment key={n}>
              <span
                className={`sticky left-0 border-r border-editor-line bg-editor-gutter px-3 text-right text-editor-gutter-fg ${
                  active ? "text-editor-fg" : ""
                }`}
              >
                {n}
              </span>
              <span className={`pr-6 pl-3 whitespace-pre ${active ? "bg-editor-active-line" : ""}`}>
                {highlight(line)}
                {line === "" && " "}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

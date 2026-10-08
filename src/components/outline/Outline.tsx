import type { OutlineItem } from "../../mocks/projectFiles";
import { PanelHeader } from "../common/PanelHeader";
import { useT } from "../../i18n";

type OutlineProps = {
  items: OutlineItem[];
  /** Line of the cursor; the section containing it is highlighted. */
  cursorLine: number;
};

export function Outline({ items, cursorLine }: OutlineProps) {
  const t = useT();
  const current = items.findLast((item) => item.line <= cursorLine);

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("outline.title")}>
      <PanelHeader title={t("outline.title")} />
      <ul className="flex-1 overflow-auto py-1">
        {items.map((item) => (
          <li key={`${item.line}-${item.title}`}>
            <button
              type="button"
              style={{ paddingLeft: `${(item.level - 1) * 14 + 12}px` }}
              aria-current={item === current ? "location" : undefined}
              className={`flex h-7 w-full items-center pr-2 text-left text-sm ${
                item === current
                  ? "bg-accent/25 text-fg"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              }`}
            >
              <span className="truncate">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

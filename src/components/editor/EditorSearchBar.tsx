import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../i18n";
import { countMatches } from "../../editor/searchCount";

type QueryFields = {
  search: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
  replace: string;
};

const iconButton =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-editor-gutter-fg hover:bg-editor-line hover:text-editor-fg disabled:opacity-40 disabled:hover:bg-transparent";
const field =
  "flex min-w-0 flex-1 items-center rounded border border-editor-line bg-editor pr-0.5 focus-within:border-(--lt-syntax-command)";
const input =
  "min-w-0 flex-1 bg-transparent px-2 py-1 text-[13px] text-editor-fg outline-none placeholder:text-editor-gutter-fg";

function Toggle(props: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onToggle}
      className={`${iconButton} aria-pressed:bg-accent/25 aria-pressed:text-editor-fg`}
    >
      {props.children}
    </button>
  );
}

/**
 * The editor's find/replace bar (Ctrl+F), in LibreTeX's style instead of CodeMirror's
 * default panel: the same options as «Buscar en el proyecto», a match counter, previous /
 * next and a foldable replace row. Colours follow the editor theme (light or dark).
 */
export function EditorSearchBar({ view }: { view: EditorView; version: number }) {
  const t = useT();
  const query = getSearchQuery(view.state);
  const [showReplace, setShowReplace] = useState(query.replace !== "");
  const count = countMatches(view.state, query);

  const set = (changes: Partial<QueryFields>) => {
    const next: QueryFields = {
      search: query.search,
      caseSensitive: query.caseSensitive,
      regexp: query.regexp,
      wholeWord: query.wholeWord,
      replace: query.replace,
      ...changes,
    };
    // Literal: `\n` in a search is a backslash and an n (`\nabla`), not a line break.
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...next, literal: true })) });
  };

  const close = () => {
    closeSearchPanel(view);
    view.focus();
  };

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const onReplaceKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceNext(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const status = !query.search
    ? ""
    : !query.valid
      ? t("editorSearch.invalid")
      : count.total === 0
        ? t("editorSearch.none")
        : count.capped
          ? t("editorSearch.many", { total: count.total })
          : t("editorSearch.count", { current: count.current || "–", total: count.total });

  return (
    <div
      className="flex flex-col gap-1 border-b border-editor-line bg-editor-gutter px-2 py-1.5 text-editor-fg"
      role="search"
      aria-label={t("editorSearch.label")}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={t("editorSearch.toggleReplace")}
          aria-label={t("editorSearch.toggleReplace")}
          aria-expanded={showReplace}
          onClick={() => setShowReplace((v) => !v)}
          className={iconButton}
        >
          {showReplace ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
        </button>
        <div className={field}>
          <input
            type="text"
            main-field="true"
            value={query.search}
            onChange={(e) => set({ search: e.target.value })}
            onKeyDown={onSearchKey}
            placeholder={t("editorSearch.find")}
            aria-label={t("editorSearch.find")}
            spellCheck={false}
            className={input}
          />
          <Toggle
            label={t("projectSearch.caseSensitive")}
            pressed={query.caseSensitive}
            onToggle={() => set({ caseSensitive: !query.caseSensitive })}
          >
            <CaseSensitive size={15} aria-hidden />
          </Toggle>
          <Toggle
            label={t("projectSearch.wholeWord")}
            pressed={query.wholeWord}
            onToggle={() => set({ wholeWord: !query.wholeWord })}
          >
            <WholeWord size={15} aria-hidden />
          </Toggle>
          <Toggle
            label={t("projectSearch.regex")}
            pressed={query.regexp}
            onToggle={() => set({ regexp: !query.regexp })}
          >
            <Regex size={15} aria-hidden />
          </Toggle>
        </div>
        <span
          className={`w-24 shrink-0 text-center text-xs ${
            query.search && (!query.valid || count.total === 0)
              ? "text-danger"
              : "text-editor-gutter-fg"
          }`}
          aria-live="polite"
        >
          {status}
        </span>
        <button
          type="button"
          title={t("editorSearch.previous")}
          aria-label={t("editorSearch.previous")}
          disabled={count.total === 0}
          onClick={() => findPrevious(view)}
          className={iconButton}
        >
          <ChevronUp size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={t("editorSearch.next")}
          aria-label={t("editorSearch.next")}
          disabled={count.total === 0}
          onClick={() => findNext(view)}
          className={iconButton}
        >
          <ChevronDown size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={t("editorSearch.close")}
          aria-label={t("editorSearch.close")}
          onClick={close}
          className={iconButton}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-1 pl-7">
          <div className={field}>
            <input
              type="text"
              value={query.replace}
              onChange={(e) => set({ replace: e.target.value })}
              onKeyDown={onReplaceKey}
              placeholder={t("editorSearch.replace")}
              aria-label={t("editorSearch.replace")}
              spellCheck={false}
              className={input}
            />
          </div>
          <button
            type="button"
            title={t("editorSearch.replaceOne")}
            aria-label={t("editorSearch.replaceOne")}
            disabled={count.total === 0 || view.state.readOnly}
            onClick={() => replaceNext(view)}
            className={iconButton}
          >
            <Replace size={15} aria-hidden />
          </button>
          <button
            type="button"
            title={t("editorSearch.replaceAll")}
            aria-label={t("editorSearch.replaceAll")}
            disabled={count.total === 0 || view.state.readOnly}
            onClick={() => replaceAll(view)}
            className={iconButton}
          >
            <ReplaceAll size={15} aria-hidden />
          </button>
          <span className="w-[4.5rem] shrink-0" aria-hidden />
        </div>
      )}
    </div>
  );
}

import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Loader2,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { keyLabel } from "../../lib/platform";
import { useProjectView } from "../../store/project";
import { useSearch } from "../../store/search";
import type { SearchMatch } from "../../store/types";
import { Dialog } from "../common/Dialog";
import { PanelHeader } from "../common/PanelHeader";

const field =
  "min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-fg outline-none placeholder:text-fg-muted";

/** A search option shown as a toggle inside the search field. */
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
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg aria-pressed:bg-accent/30 aria-pressed:text-fg"
    >
      {props.children}
    </button>
  );
}

type Pending = { paths?: string[]; count: number; files: number };

/**
 * «Buscar en el proyecto» (Ctrl+Shift+F): every occurrence in the project's text files,
 * grouped by file; a click selects it in the editor. Replacing changes the files on disk
 * (after a confirmation) and updates the open ones.
 */
export function SearchPanel() {
  const t = useT();
  const { query, replacement, results, status, error, replacing, focusRequest } = useSearch();
  const { setQuery, setReplacement, search, replace } = useSearch.getState();
  const goToRange = useProjectView((s) => s.goToRange);
  const input = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  const total = results?.files.reduce((sum, f) => sum + f.matches.length, 0) ?? 0;

  const toggleFile = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const confirmReplace = () => {
    const request = pending;
    setPending(null);
    if (!request) return;
    replace(request.paths)
      .then((done) => {
        const count = done.reduce((sum, r) => sum + r.count, 0);
        notifyInfo(
          `${t("projectSearch.replaced", { count })} ${t("projectSearch.inFiles", { count: done.length })}.`,
        );
      })
      .catch(notifyError);
  };

  const open = (path: string, match: SearchMatch) =>
    goToRange(path, {
      line: match.line,
      column: match.column,
      endLine: match.endLine,
      endColumn: match.endColumn,
    });

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("projectSearch.title")}>
      <PanelHeader title={t("projectSearch.title")} />
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line p-2">
        <div className="flex items-center rounded border border-line bg-topbar pr-1 focus-within:border-accent-text">
          <input
            ref={input}
            type="search"
            value={query.text}
            onChange={(e) => setQuery({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder={t("projectSearch.placeholder")}
            aria-label={t("projectSearch.placeholder")}
            spellCheck={false}
            className={field}
          />
          <Toggle
            label={t("projectSearch.caseSensitive")}
            pressed={query.caseSensitive}
            onToggle={() => setQuery({ caseSensitive: !query.caseSensitive })}
          >
            <CaseSensitive size={15} aria-hidden />
          </Toggle>
          <Toggle
            label={t("projectSearch.wholeWord")}
            pressed={query.wholeWord}
            onToggle={() => setQuery({ wholeWord: !query.wholeWord })}
          >
            <WholeWord size={15} aria-hidden />
          </Toggle>
          <Toggle
            label={t("projectSearch.regex")}
            pressed={query.regex}
            onToggle={() => setQuery({ regex: !query.regex })}
          >
            <Regex size={15} aria-hidden />
          </Toggle>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 rounded border border-line bg-topbar focus-within:border-accent-text">
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={t("projectSearch.replacePlaceholder")}
              aria-label={t("projectSearch.replacePlaceholder")}
              spellCheck={false}
              className={field}
            />
          </div>
          <button
            type="button"
            title={t("projectSearch.replaceAll")}
            aria-label={t("projectSearch.replaceAll")}
            disabled={total === 0 || replacing || status !== "done"}
            onClick={() => setPending({ count: total, files: results?.files.length ?? 0 })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ReplaceAll size={15} aria-hidden />
          </button>
        </div>
        {query.regex && <p className="text-[11px] text-fg-muted">{t("projectSearch.regexHint")}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto text-sm" aria-live="polite">
        {status === "searching" && !results && (
          <p className="flex items-center gap-2 px-3 py-2 text-fg-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {t("projectSearch.searching")}
          </p>
        )}
        {status === "error" && error && (
          <div className="px-3 py-2 text-danger">
            <p>{error.text}</p>
            {error.detail && (
              <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">
                {error.detail}
              </pre>
            )}
          </div>
        )}
        {status === "idle" && (
          <p className="px-3 py-2 text-fg-muted">
            {t("projectSearch.hint", { key: keyLabel("Mod+Shift+F") })}
          </p>
        )}
        {results && status !== "error" && (
          <>
            <p className="px-3 py-1.5 text-xs text-fg-muted">
              {total === 0
                ? t("projectSearch.none")
                : `${t("projectSearch.results", { count: total })} ${t("projectSearch.inFiles", { count: results.files.length })}`}
              {results.truncated && ` · ${t("projectSearch.truncated", { count: total })}`}
            </p>
            <ul>
              {results.files.map((file) => {
                const open_ = !collapsed.has(file.path);
                return (
                  <li key={file.path} className="border-b border-line/60">
                    <div className="group flex items-center hover:bg-hover">
                      <button
                        type="button"
                        aria-expanded={open_}
                        onClick={() => toggleFile(file.path)}
                        className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                      >
                        {open_ ? (
                          <ChevronDown size={13} className="shrink-0 text-fg-muted" aria-hidden />
                        ) : (
                          <ChevronRight size={13} className="shrink-0 text-fg-muted" aria-hidden />
                        )}
                        <span className="truncate font-medium" title={file.path}>
                          {file.path}
                        </span>
                        <span className="ml-auto shrink-0 rounded bg-topbar px-1.5 text-[11px] text-fg-muted">
                          {file.matches.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={t("projectSearch.replaceInFile")}
                        aria-label={`${t("projectSearch.replaceInFile")}: ${file.path}`}
                        disabled={replacing}
                        onClick={() =>
                          setPending({
                            paths: [file.path],
                            count: file.matches.length,
                            files: 1,
                          })
                        }
                        className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted opacity-0 group-hover:opacity-100 hover:text-fg focus:opacity-100"
                      >
                        <Replace size={14} aria-hidden />
                      </button>
                    </div>
                    {open_ && (
                      <ul>
                        {file.matches.map((match) => (
                          <li key={`${match.line}:${match.column}`}>
                            <button
                              type="button"
                              onClick={() => open(file.path, match)}
                              title={t("projectSearch.line", { line: match.line })}
                              className="flex w-full gap-2 py-0.5 pr-2 pl-6 text-left font-mono text-[12px] hover:bg-hover"
                            >
                              <span className="w-8 shrink-0 text-right text-fg-muted">
                                {match.line}
                              </span>
                              <span className="min-w-0 truncate whitespace-pre text-fg-muted">
                                {match.before}
                                <mark className="rounded-sm bg-accent/40 text-fg">
                                  {match.text}
                                </mark>
                                {match.after}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {pending && (
        <Dialog
          title={t("projectSearch.confirmTitle")}
          submitLabel={t("projectSearch.replaceAll")}
          danger
          onSubmit={confirmReplace}
          onClose={() => setPending(null)}
        >
          <p className="text-sm">
            {replacement === ""
              ? t("projectSearch.confirmDelete", { count: pending.count, text: query.text })
              : t("projectSearch.confirmReplace", {
                  count: pending.count,
                  text: query.text,
                  replacement,
                })}{" "}
            {t("projectSearch.inFiles", { count: pending.files })}.
          </p>
          <p className="mt-2 text-xs text-fg-muted">{t("projectSearch.confirmNote")}</p>
        </Dialog>
      )}
    </section>
  );
}

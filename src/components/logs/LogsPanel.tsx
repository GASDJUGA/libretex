import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useT, type TranslationKey } from "../../i18n";
import type { LogEntry } from "../../lib/latexLog/parse";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { PanelHeader } from "../common/PanelHeader";
import { MissingPackage } from "../packages/MissingPackage";
import { CompileOutput } from "./CompileOutput";

type Tab = "problems" | "log" | "output";

const GROUPS: {
  key: "errors" | "warnings" | "typesetting";
  label: TranslationKey;
  Icon: typeof XCircle;
  color: string;
}[] = [
  { key: "errors", label: "logs.errors", Icon: XCircle, color: "text-danger" },
  { key: "warnings", label: "logs.warnings", Icon: AlertTriangle, color: "text-warning" },
  { key: "typesetting", label: "logs.typesetting", Icon: Info, color: "text-info" },
];

/** Problems of the last compilation (click to jump to the line), the raw log and the output. */
export function LogsPanel() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("problems");
  const last = useCompile((s) => s.last);

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("rail.logs")}>
      <PanelHeader title={t("rail.logs")} />
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-line px-2 py-1 text-xs">
        {(["problems", "log", "output"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="rounded px-2 py-1 text-fg-muted hover:bg-hover aria-selected:bg-hover aria-selected:text-fg"
          >
            {t(id === "problems" ? "logs.problems" : id === "log" ? "logs.rawLog" : "logs.output")}
          </button>
        ))}
      </div>
      {tab === "output" ? (
        <CompileOutput />
      ) : !last ? (
        <p className="p-3 text-sm text-fg-muted">{t("logs.notCompiled")}</p>
      ) : tab === "log" ? (
        last.log ? (
          <pre className="m-0 min-h-0 flex-1 overflow-auto bg-topbar p-3 font-mono text-[11px] leading-4 whitespace-pre-wrap text-fg-muted select-text">
            {last.log}
          </pre>
        ) : (
          <p className="p-3 text-sm text-fg-muted">{t("logs.noLog")}</p>
        )
      ) : (
        <Problems />
      )}
    </section>
  );
}

function Problems() {
  const t = useT();
  const last = useCompile((s) => s.last)!;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["typesetting"]));
  const total =
    last.parsed.errors.length + last.parsed.warnings.length + last.parsed.typesetting.length;

  const StatusIcon =
    last.status === "success" ? CheckCircle2 : last.status === "failed" ? XCircle : Info;
  return (
    <div className="min-h-0 flex-1 overflow-auto text-sm">
      <p
        className={`flex items-center gap-2 border-b border-line px-3 py-2 ${
          last.status === "success"
            ? "text-success"
            : last.status === "failed"
              ? "text-danger"
              : "text-fg-muted"
        }`}
      >
        <StatusIcon size={15} aria-hidden />
        {t(`logs.${last.status}`)}
        <span className="text-xs text-fg-muted">
          {t("logs.inSeconds", { seconds: (last.durationMs / 1000).toFixed(1) })}
        </span>
      </p>
      {last.error && (
        <p className="px-3 py-2 text-danger">{t("logs.startError", { error: last.error })}</p>
      )}
      {total === 0 && <p className="px-3 py-2 text-fg-muted">{t("logs.none")}</p>}
      {GROUPS.map(({ key, label, Icon, color }) => {
        const entries = last.parsed[key];
        if (entries.length === 0) return null;
        const open = !collapsed.has(key);
        return (
          <section key={key} aria-label={t(label)}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase hover:bg-hover"
            >
              {open ? (
                <ChevronDown size={13} aria-hidden />
              ) : (
                <ChevronRight size={13} aria-hidden />
              )}
              <Icon size={13} className={color} aria-hidden />
              {t(label)} ({entries.length})
            </button>
            {open && (
              <ul>
                {entries.map((entry, i) => (
                  <ProblemItem key={i} entry={entry} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProblemItem({ entry }: { entry: LogEntry }) {
  const t = useT();
  const goToLine = useProjectView((s) => s.goToLine);
  // Only files of the project can be opened (not those of the TeX distribution).
  const navigable = entry.file !== null && !entry.file.startsWith("/");
  const location = entry.file
    ? `${entry.file}${entry.line !== null ? `:${entry.line}` : ""}`
    : null;

  return (
    <li className="border-b border-line/60">
      <button
        type="button"
        disabled={!navigable}
        onClick={() => navigable && goToLine(entry.file!, entry.line ?? 1)}
        title={
          navigable && entry.line !== null
            ? t("logs.goTo", { file: entry.file!, line: entry.line })
            : undefined
        }
        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="break-words">{entry.message}</span>
        {location && <span className="font-mono text-[11px] text-fg-muted">{location}</span>}
        {entry.context.length > 0 && (
          <pre className="mt-1 max-h-24 overflow-hidden rounded bg-topbar px-2 py-1 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">
            {entry.context.slice(0, 4).join("\n")}
          </pre>
        )}
      </button>
      {entry.kind === "missingFile" && entry.missingFile?.endsWith(".sty") && (
        <div className="px-3 pb-2">
          <MissingPackage file={entry.missingFile} />
        </div>
      )}
    </li>
  );
}

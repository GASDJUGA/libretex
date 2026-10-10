import { useEffect, useRef } from "react";
import { useT } from "../../i18n";
import { useCompile } from "../../store/compile";

/** latexmk's live output, scrolled to the end while it runs. */
export function CompileOutput() {
  const t = useT();
  const output = useCompile((s) => s.output);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [output.length]);

  if (output.length === 0) {
    return <p className="p-3 text-sm text-fg-muted">{t("compile.noOutput")}</p>;
  }
  return (
    <pre
      aria-label={t("compile.output")}
      className="m-0 min-h-0 flex-1 overflow-auto bg-topbar p-3 font-mono text-[11px] leading-4 whitespace-pre-wrap text-fg-muted select-text"
    >
      {output.join("\n")}
      <div ref={endRef} />
    </pre>
  );
}

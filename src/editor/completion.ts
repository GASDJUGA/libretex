import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

export type ArgumentKind = "ref" | "cite" | "graphics" | "input" | "bibliography" | "bibresource";

const COMMANDS: Record<string, ArgumentKind> = {
  ref: "ref",
  eqref: "ref",
  pageref: "ref",
  autoref: "ref",
  nameref: "ref",
  cref: "ref",
  Cref: "ref",
  vref: "ref",
  cite: "cite",
  citep: "cite",
  citet: "cite",
  citealp: "cite",
  citeauthor: "cite",
  citeyear: "cite",
  parencite: "cite",
  textcite: "cite",
  autocite: "cite",
  footcite: "cite",
  smartcite: "cite",
  nocite: "cite",
  includegraphics: "graphics",
  input: "input",
  include: "input",
  subfile: "input",
  bibliography: "bibliography",
  addbibresource: "bibresource",
};

/** Kinds whose argument is a comma-separated list. */
const LISTS: ArgumentKind[] = ["ref", "cite", "bibliography"];

/**
 * If the text before the cursor ends inside the braces of a command we complete
 * (`\ref{sec:`), returns its kind, where the current item starts (offset in `before`) and
 * what has been typed of it.
 */
export function argumentContext(
  before: string,
): { kind: ArgumentKind; from: number; prefix: string } | null {
  const match = /\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\{([^{}]*)$/.exec(before);
  if (!match) return null;
  const kind = COMMANDS[match[1]];
  if (!kind) return null;
  const arg = match[2];
  const argStart = before.length - arg.length;
  if (!LISTS.includes(kind)) return { kind, from: argStart, prefix: arg };
  const lastComma = arg.lastIndexOf(",");
  const item = arg.slice(lastComma + 1);
  const leading = item.length - item.trimStart().length;
  return { kind, from: argStart + lastComma + 1 + leading, prefix: item.trimStart() };
}

/** `\label{…}` keys of a document (outside `%` comments). */
export function labelsIn(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split("\n")) {
    const code = line.replace(/(^|[^\\])%.*$/, "$1");
    for (const m of code.matchAll(/\\label\s*\{([^{}]+)\}/g)) keys.push(m[1].trim());
  }
  return keys;
}

const IMAGE = /\.(png|jpe?g|pdf|eps|svg)$/i;

export type CompletionData = {
  labels: () => { key: string; file: string; line: number }[];
  citations: () => { key: string; kind: string; title: string | null }[];
  /** Every file of the project (relative paths). */
  files: () => string[];
  /** Translated detail texts. */
  describe: { label: (file: string, line: number) => string };
};

/** Completion source for references, citations and file paths of the project. */
export function projectCompletionSource(data: CompletionData) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const arg = argumentContext(before);
    if (!arg) return null;
    const from = line.from + arg.from;
    let options: Completion[] = [];

    switch (arg.kind) {
      case "ref": {
        const known = data.labels();
        const local = labelsIn(context.state.doc.toString()).filter(
          (key) => !known.some((l) => l.key === key),
        );
        options = [
          ...known.map((l) => ({
            label: l.key,
            type: "variable",
            detail: data.describe.label(l.file, l.line),
          })),
          ...local.map((key) => ({ label: key, type: "variable" })),
        ];
        break;
      }
      case "cite":
        options = data.citations().map((c) => ({
          label: c.key,
          type: "constant",
          detail: c.title ?? c.kind,
        }));
        break;
      case "graphics":
        options = data
          .files()
          .filter((f) => IMAGE.test(f))
          .map((f) => ({ label: f, type: "text" }));
        break;
      case "input":
        options = data
          .files()
          .filter((f) => f.endsWith(".tex"))
          .map((f) => ({ label: f.slice(0, -4), type: "text", detail: ".tex" }));
        break;
      case "bibliography":
        options = data
          .files()
          .filter((f) => f.endsWith(".bib"))
          .map((f) => ({ label: f.slice(0, -4), type: "text", detail: ".bib" }));
        break;
      case "bibresource":
        options = data
          .files()
          .filter((f) => f.endsWith(".bib"))
          .map((f) => ({ label: f, type: "text" }));
        break;
    }
    if (options.length === 0) return null;
    return { from, options, validFor: /^[^{},\s]*$/ };
  };
}

/**
 * Command completion on top of the language package's: `\begin`/`\end` come with their
 * braces and open the list of environments, and the user's own commands (`\newcommand` of
 * the preamble and the files it includes) are suggested with their arguments.
 */
import {
  snippet,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { commandIndex, mathOnlyCommands, symbolIndex } from "codemirror-lang-latex";
import { packageCompletions } from "./packageCommands";
import type { MathJaxMacros } from "../lib/macros/extract";
import { figureSpec } from "./figure";
import { mathRegionInState } from "./mathRegion";

/** Commands that take an environment name: inserted with braces, then the names are listed. */
const ENVIRONMENT_COMMANDS = new Set(["\\begin", "\\end"]);

function withBraces(option: Completion): Completion {
  return {
    ...option,
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const hasBrace = view.state.sliceDoc(to, to + 1) === "{";
      const insert = hasBrace ? option.label : `${option.label}{}`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + option.label.length + 1 },
        userEvent: "input.complete",
      });
      // The environment names, right away (the list just closed for this completion).
      setTimeout(() => startCompletion(view));
    },
  };
}

/** «figure» from the list of environments: the whole figure (see figure.ts). */
function withFigureBody(option: Completion): Completion {
  return {
    ...option,
    apply: (view: EditorView, completion: Completion, from: number, to: number) => {
      const closing = view.state.sliceDoc(to, to + 1) === "}" ? 1 : 0;
      const spec = figureSpec(view.state, from, to + closing, option.label);
      if (spec) view.dispatch(spec);
      else if (typeof option.apply === "function") option.apply(view, completion, from, to);
      else view.dispatch({ changes: { from, to, insert: option.apply ?? option.label } });
    },
  };
}

/** Math commands the package lists only as plain commands. */
const MATH_ALSO = new Set(["\\sum", "\\int", "\\prod", "\\lim", "\\infty", "\\partial"]);

/** A command meant for math: symbols, operators, `\frac`, `\vec`, `\begin{cases}`… */
export function isMathCommand(label: string): boolean {
  return (
    mathOnlyCommands.has(label) ||
    symbolIndex.has(label) ||
    commandIndex.get(label)?.math === true ||
    MATH_ALSO.has(label)
  );
}

/**
 * Inside math: math commands first, text commands (`\par`, `\part`, `\item`…) last. Large
 * enough to beat CodeMirror's match score: a label typed in full (`\par`) scores 100 more
 * than one only started (`\partial`).
 */
export const MATH_BOOST = 50;

/** Environments used inside a formula (`\begin{cases}` within `\[ … \]`). */
export const MATH_ENVIRONMENTS = new Set([
  "aligned",
  "alignedat",
  "gathered",
  "split",
  "multlined",
  "cases",
  "cases*",
  "dcases",
  "rcases",
  "array",
  "subarray",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "matrix*",
  "pmatrix*",
  "bmatrix*",
]);
export const TEXT_IN_MATH_BOOST = -60;

/**
 * The language package's source, with `\begin`/`\end` completing their braces, the figure
 * environment coming with its body and, inside math, math commands before text ones
 * (pedido del usuario: `\par` y `\part` aparecían antes que `\partial`).
 */
export function environmentBraces(source: CompletionSource): CompletionSource {
  return async (context: CompletionContext) => {
    const result = await source(context);
    if (!result) return result;
    const inMath = mathRegionInState(context.state, context.pos) !== null;
    return {
      ...result,
      options: result.options.map((o) => {
        const option = ENVIRONMENT_COMMANDS.has(o.label)
          ? withBraces(o)
          : /^figure\*?$/.test(o.label)
            ? withFigureBody(o)
            : o;
        if (!inMath) return option;
        // Inside a formula, `\begin`/`\end` alone (with the list of environments) come
        // before the `\begin{align}`… shortcuts (pedido del usuario).
        if (ENVIRONMENT_COMMANDS.has(o.label)) {
          return { ...option, boost: (option.boost ?? 0) + MATH_BOOST + 1 };
        }
        // An environment name (`\begin{|}`): those that work inside a formula first.
        if (!o.label.startsWith("\\")) {
          const boost = MATH_ENVIRONMENTS.has(o.label) ? MATH_BOOST : TEXT_IN_MATH_BOOST;
          return { ...option, boost: (option.boost ?? 0) + boost };
        }
        const boost = isMathCommand(o.label) ? MATH_BOOST : TEXT_IN_MATH_BOOST;
        return { ...option, boost: (option.boost ?? 0) + boost };
      }),
    };
  };
}

/** `\name{…}{…}` with a field per mandatory argument (Tab goes to the next one). */
export function commandTemplate(name: string, macro: MathJaxMacros[string]): string {
  if (typeof macro === "string") return `\\${name}`;
  const [, count, optional] = macro;
  const mandatory = optional === undefined ? count : count - 1;
  let template = `\\${name}`;
  for (let i = 1; i <= mandatory; i++) template += `{\${${i}}}`;
  return template;
}

/** The user's commands (the preamble's macros) while typing `\…`. */
export function userCommandSource(
  macros: () => MathJaxMacros,
  detail: () => string,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\\[A-Za-z@]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const inMath = mathRegionInState(context.state, context.pos) !== null;
    const options = Object.entries(macros()).map(([name, macro]): Completion => {
      const template = commandTemplate(name, macro);
      return {
        label: `\\${name}`,
        type: "function",
        detail: detail(),
        // Above the package's commands with a similar name: these are the user's (usually
        // math macros, so inside math they also get the math boost).
        boost: inMath ? 2 + MATH_BOOST : 2,
        apply: template === `\\${name}` ? template : snippet(template),
      };
    });
    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\\[A-Za-z@]*$/ };
  };
}

/** Commands of the packages the document loads (`\usepackage{physics}` → `\ket`…). */
export function packageCommandSource(packages: () => Set<string>): CompletionSource {
  const known = (label: string) => commandIndex.has(label) || symbolIndex.has(label);
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\\[A-Za-z@]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const loaded = packages();
    if (loaded.size === 0) return null;
    const inMath = mathRegionInState(context.state, context.pos) !== null;
    // A package loaded on purpose: its commands (like the user's, +2) just above the
    // generic ones with a similar name, which have +1 (`\ket` before `\ker`).
    const options = packageCompletions(loaded, known).map(({ math, ...option }): Completion => {
      const context = inMath ? (math ? MATH_BOOST : TEXT_IN_MATH_BOOST) : 0;
      return { ...option, boost: context + 2 };
    });
    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\\[A-Za-z@]*$/ };
  };
}

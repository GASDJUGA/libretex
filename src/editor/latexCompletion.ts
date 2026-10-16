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
import type { MathJaxMacros } from "../lib/macros/extract";
import { figureSpec } from "./figure";

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

/**
 * The language package's source, with `\begin`/`\end` completing their braces and the figure
 * environment coming with its body.
 */
export function environmentBraces(source: CompletionSource): CompletionSource {
  return async (context: CompletionContext) => {
    const result = await source(context);
    if (!result) return result;
    return {
      ...result,
      options: result.options.map((o) =>
        ENVIRONMENT_COMMANDS.has(o.label)
          ? withBraces(o)
          : /^figure\*?$/.test(o.label)
            ? withFigureBody(o)
            : o,
      ),
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
    const options = Object.entries(macros()).map(([name, macro]): Completion => {
      const template = commandTemplate(name, macro);
      return {
        label: `\\${name}`,
        type: "function",
        detail: detail(),
        // Above the package's commands with a similar name: these are the user's.
        boost: 2,
        apply: template === `\\${name}` ? template : snippet(template),
      };
    });
    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\\[A-Za-z@]*$/ };
  };
}

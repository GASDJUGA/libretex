import { completionStatus } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completionProject, resetCompletionUsage } from "./completionUsage";
import { packageCommandSource } from "./latexCompletion";
import { COMPLETION_INTERACTION_DELAY_MS } from "./mathTab";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
beforeEach(() => {
  resetCompletionUsage();
  localStorage.clear();
});
afterEach(() => {
  view?.destroy();
  view = null;
});

function editor(doc: string) {
  const cursor = doc.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: cursor },
      extensions: [
        completionProject.of("proyecto"),
        editorExtensions(
          { onChange() {}, onCursorLine() {}, onSave() {} },
          [],
          [packageCommandSource(() => new Set(["physics"]))],
        ),
      ],
    }),
    parent: document.body,
  });
  return view;
}

function type(v: EditorView, text: string) {
  for (const ch of text) {
    const at = v.state.selection.main.head;
    v.dispatch({
      changes: { from: at, insert: ch },
      selection: { anchor: at + 1 },
      userEvent: "input.type",
    });
  }
}

const tab = (v: EditorView) =>
  runScopeHandlers(v, new KeyboardEvent("keydown", { key: "Tab" }), "editor");

const settle = () => new Promise((r) => setTimeout(r, COMPLETION_INTERACTION_DELAY_MS + 60));

const shown = (v: EditorView) => {
  const doc = v.state.doc.toString();
  const at = v.state.selection.main.head;
  return doc.slice(0, at) + "|" + doc.slice(at);
};

/** `\braket{|}{}` with its fields active, as after choosing it from the list. */
async function braket() {
  const v = editor("\\begin{document}\n$|$\n\\end{document}");
  type(v, "\\brak");
  await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
  await settle();
  tab(v);
  await waitFor(() => expect(shown(v)).toContain("$\\braket{|}{}$"));
  return v;
}

describe("Tab dentro de los argumentos de algo recién completado", () => {
  it("\\tilde escrito entero dentro de \\braket: Tab lo completa con sus llaves", async () => {
    const v = await braket();
    type(v, "\\tilde");
    await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
    await settle();
    tab(v);
    await waitFor(() => expect(shown(v)).toContain("$\\braket{\\tilde{|}}{}$"));
    // And then Tab goes on to the next argument of \braket.
    type(v, "x");
    tab(v);
    expect(shown(v)).toContain("$\\braket{\\tilde{x}}{|}$");
  });

  it("también si la lista todavía no apareció", async () => {
    const v = await braket();
    type(v, "\\til");
    tab(v);
    await waitFor(() => expect(shown(v)).toContain("$\\braket{\\tilde{|}}{}$"));
  });
});

describe("Tab sale del grupo", () => {
  it("al siguiente argumento", () => {
    const v = editor("$\\frac{a|}{b}$");
    expect(tab(v)).toBe(true);
    expect(shown(v)).toBe("$\\frac{a}{|b}$");
    v.dispatch({ selection: { anchor: v.state.selection.main.head + 1 } });
    tab(v);
    expect(shown(v)).toBe("$\\frac{a}{b}|$");
  });

  it("pasado el \\right)", () => {
    const v = editor("$\\left( x |\\right) + 1$");
    tab(v);
    expect(shown(v)).toBe("$\\left( x \\right)| + 1$");
  });

  it("también fuera de matemáticas", () => {
    const v = editor("\\section{Intro|}\n");
    tab(v);
    expect(shown(v)).toBe("\\section{Intro}|\n");
  });

  it("al inicio de la línea sigue indentando", () => {
    const v = editor("\\begin{itemize}\n|\\item a\n\\end{itemize}");
    tab(v);
    expect(v.state.doc.line(2).text).toMatch(/^\s+\\item a$/);
  });
});

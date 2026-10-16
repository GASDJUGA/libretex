import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function create(doc: string) {
  const at = doc.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: at },
      extensions: editorExtensions({ onChange() {}, onCursorLine() {}, onSave() {} }),
    }),
    parent: document.body,
  });
  return view;
}

/** Types `text` the way CodeMirror does (input handlers first, then a plain insert). */
function type(v: EditorView, text: string) {
  const { from, to } = v.state.selection.main;
  const insert = () =>
    v.state.update({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
  const handled = v.state
    .facet(EditorView.inputHandler)
    .some((handler) => handler(v, from, to, text, insert));
  if (!handled) v.dispatch(insert());
  const out = v.state.doc.toString();
  const head = v.state.selection.main.head;
  return out.slice(0, head) + "|" + out.slice(head);
}

const typeAt = (doc: string, text: string) => type(create(doc), text);

describe("cierre automático de paréntesis", () => {
  it.each([
    ["display, antes de \\]", "\\[x = |\\]", "(", "\\[x = (|)\\]"],
    ["display en varias líneas, fin de línea", "\\[\n  x = |\n\\]", "(", "\\[\n  x = (|)\n\\]"],
    ["inline, antes de $", "$x = |$", "(", "$x = (|)$"],
    ["inline \\( \\), antes de \\)", "\\(x = |\\)", "(", "\\(x = (|)\\)"],
    [
      "antes de \\\\ (salto de línea en align)",
      "\\begin{align}\n  x &= |\\\\\n\\end{align}",
      "(",
      "\\begin{align}\n  x &= (|)\\\\\n\\end{align}",
    ],
    ["antes de \\right", "\\left( x |\\right)", "(", "\\left( x (|)\\right)"],
    ["corchete antes de \\]", "\\[x = |\\]", "[", "\\[x = [|]\\]"],
    ["llave antes de \\] (exponente)", "\\[x^|\\]", "{", "\\[x^{|}\\]"],
    ["antes de \\, (espacio fino)", "\\[x = |\\,dx\\]", "(", "\\[x = (|)\\,dx\\]"],
  ])("%s", (_name, doc, typed, expected) => {
    expect(typeAt(doc, typed)).toBe(expected);
  });

  it("antes de un comando no cierra: se lo está envolviendo", () => {
    expect(typeAt("\\[x = |\\frac{1}{2}\\]", "(")).toBe("\\[x = (|\\frac{1}{2}\\]");
  });

  it("escribir ) salta el paréntesis cerrado automáticamente", () => {
    const v = create("\\[x = |\\]");
    type(v, "(");
    type(v, "a");
    expect(type(v, ")")).toBe("\\[x = (a)|\\]");
  });

  it("antes de una letra no cierra (se está envolviendo texto)", () => {
    expect(typeAt("\\[x = |abc\\]", "(")).toBe("\\[x = (|abc\\]");
  });
});

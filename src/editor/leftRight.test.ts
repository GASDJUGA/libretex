import { closeBrackets } from "@codemirror/autocomplete";
import { undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { closerLacksOpener, closingPair } from "./leftRight";
import { editorExtensions } from "./setup";

describe("pares \\left … \\right", () => {
  it("el cierre de cada delimitador", () => {
    expect(closingPair("x + \\left(")).toBe("\\right)");
    expect(closingPair("\\left[")).toBe("\\right]");
    expect(closingPair("\\left\\{")).toBe("\\right\\}");
    expect(closingPair("\\left|")).toBe("\\right|");
    expect(closingPair("\\left\\|")).toBe("\\right\\|");
    expect(closingPair("\\left.")).toBe("\\right.");
    expect(closingPair("\\left\\langle")).toBe("\\right\\rangle");
    expect(closingPair("\\left \\lfloor")).toBe("\\right\\rfloor");
    expect(closingPair("\\bigl(")).toBe("\\bigr)");
    expect(closingPair("\\Biggl\\lvert")).toBe("\\Biggr\\rvert");
  });

  it("nada si no es un \\left completo", () => {
    expect(closingPair("(")).toBeNull();
    expect(closingPair("\\left")).toBeNull();
    expect(closingPair("\\left\\lang")).toBeNull();
    expect(closingPair("\\leftarrow(")).toBeNull();
    // `\\left(` is a line break and the word «left(».
    expect(closingPair("\\\\left(")).toBeNull();
    // A letter delimiter still being typed (`\left\lvert` → `\left\lvertneqq`?).
    expect(closingPair("\\left\\vert", "x")).toBeNull();
  });
});

describe("¿al \\right siguiente le falta su \\left?", () => {
  it("cuenta los pares de antes y de después", () => {
    // Retyping the opener of `\\right)`: it has none.
    expect(closerLacksOpener("$\\left(", "\\right)$", "left", "right")).toBe(true);
    // Inside a complete pair: the closer is the outer one's.
    expect(closerLacksOpener("$\\left(\\left(", "\\right)$", "left", "right")).toBe(false);
    expect(
      closerLacksOpener(
        "$\\left(a\\right)\\left(",
        "\\right) b \\left[c\\right]$",
        "left",
        "right",
      ),
    ).toBe(true);
    // A line break (`\\\\`) followed by «left» is not an opener.
    expect(closerLacksOpener("\\\\left x \\left(", "\\right)", "left", "right")).toBe(true);
  });
});

describe("en el editor", () => {
  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    view = null;
  });

  function editor(doc: string, extraCloseBrackets = false) {
    const cursor = doc.indexOf("|");
    view = new EditorView({
      state: EditorState.create({
        doc: doc.replace("|", ""),
        selection: { anchor: cursor },
        extensions: [
          editorExtensions({ onChange() {}, onCursorLine() {}, onSave() {} }),
          extraCloseBrackets ? closeBrackets() : [],
        ],
      }),
      parent: document.body,
    });
    return view;
  }

  /** Types `text` as the keyboard would (input handlers, closeBrackets…). */
  function type(v: EditorView, text: string) {
    for (const ch of text) {
      const { from, to } = v.state.selection.main;
      const handled = v.state
        .facet(EditorView.inputHandler)
        .some((h) =>
          h(v, from, to, ch, () => v.state.update({ changes: { from, to, insert: ch } })),
        );
      if (!handled) {
        v.dispatch({
          changes: { from, to, insert: ch },
          selection: { anchor: from + ch.length },
          userEvent: "input.type",
        });
      }
    }
  }

  const shown = (v: EditorView) => {
    const doc = v.state.doc.toString();
    const at = v.state.selection.main.head;
    return doc.slice(0, at) + "|" + doc.slice(at);
  };

  it.each([
    ["\\left(", "$\\left(|\\right)$"],
    ["\\left[", "$\\left[|\\right]$"],
    ["\\left\\{", "$\\left\\{|\\right\\}$"],
    ["\\left|", "$\\left||\\right|$"],
    ["\\left\\langle", "$\\left\\langle|\\right\\rangle$"],
    ["\\bigl(", "$\\bigl(|\\bigr)$"],
  ])("%s", (typed, expected) => {
    const v = editor("$|$");
    type(v, typed);
    expect(shown(v)).toBe(expected);
  });

  it("deshacer quita el par entero de una vez", () => {
    const v = editor("$x|$");
    type(v, "\\left(");
    expect(v.state.doc.toString()).toBe("$x\\left(\\right)$");
    // Typing is grouped into one undo step: `\right)` never stays behind alone.
    undo(v);
    expect(v.state.doc.toString()).toBe("$x$");
  });

  it("no duplica un \\right que ya está ahí", () => {
    const v = editor("$\\left|\\right)$");
    type(v, "(");
    expect(v.state.doc.toString()).toBe("$\\left(\\right)$");
  });

  it("dentro de un par completo, junto a su \\right, abre un par nuevo", () => {
    const v = editor("$\\left(|\\right)$");
    type(v, "\\left(");
    expect(shown(v)).toBe("$\\left(\\left(|\\right)\\right)$");
  });

  it("al lado de un par completo, también", () => {
    const v = editor("$\\left(x\\right)|$");
    type(v, "\\left[");
    expect(shown(v)).toBe("$\\left(x\\right)\\left[|\\right]$");
    const w = editor("$\\left(x\\right)|\\right)$");
    // The `\\right)` after the cursor has no opener: this one is its opener.
    type(w, "\\left(");
    expect(shown(w)).toBe("$\\left(x\\right)\\left(|\\right)$");
  });
});

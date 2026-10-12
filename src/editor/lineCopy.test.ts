import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { copyWholeLines } from "./lineCopy";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function editor(doc: string, selection: EditorSelection) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection,
      extensions: EditorState.allowMultipleSelections.of(true),
    }),
    parent: document.body,
  });
  return view;
}

function clipboardEvent() {
  const data = new Map<string, string>();
  let prevented = false;
  return {
    event: {
      clipboardData: {
        clearData: () => data.clear(),
        setData: (type: string, value: string) => void data.set(type, value),
      },
      preventDefault: () => {
        prevented = true;
      },
    },
    text: () => data.get("text/plain"),
    prevented: () => prevented,
  };
}

const DOC = "a\n\\[\n  x = \\vec{r}\n\\]\nb";

describe("copiar sin selección", () => {
  it("copia la línea entera como texto normal (se pegará en el cursor)", () => {
    const v = editor(DOC, EditorSelection.single(DOC.indexOf("vec")));
    const clip = clipboardEvent();
    expect(copyWholeLines(v, clip.event, false)).toBe(true);
    expect(clip.text()).toBe("  x = \\vec{r}");
    expect(clip.prevented()).toBe(true);
    expect(v.state.doc.toString()).toBe(DOC);
  });

  it("con una selección real no interviene (lo hace CodeMirror)", () => {
    const v = editor(DOC, EditorSelection.single(2, 5));
    const clip = clipboardEvent();
    expect(copyWholeLines(v, clip.event, false)).toBe(false);
    expect(clip.text()).toBeUndefined();
  });

  it("cortar sin selección quita la línea entera", () => {
    const v = editor(DOC, EditorSelection.single(DOC.indexOf("vec")));
    const clip = clipboardEvent();
    copyWholeLines(v, clip.event, true);
    expect(clip.text()).toBe("  x = \\vec{r}");
    expect(v.state.doc.toString()).toBe("a\n\\[\n\\]\nb");
  });

  it("varios cursores en la misma línea la copian una vez", () => {
    const at = DOC.indexOf("x =");
    const v = editor(
      DOC,
      EditorSelection.create([
        EditorSelection.cursor(at),
        EditorSelection.cursor(at + 2),
        EditorSelection.cursor(0),
      ]),
    );
    const clip = clipboardEvent();
    copyWholeLines(v, clip.event, false);
    expect(clip.text()).toBe("a\n  x = \\vec{r}");
  });
});

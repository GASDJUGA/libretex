import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { directChecker } from "../lib/spell/checker";
import { createSpeller } from "../lib/spell/speller";
import { replaceWord, spellcheck, type MisspelledWord } from "./spellcheck";

const es = directChecker(
  createSpeller(
    readFileSync("node_modules/dictionary-es/index.aff", "utf8"),
    readFileSync("node_modules/dictionary-es/index.dic", "utf8"),
  ),
);

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function editor(doc: string, onMenu = vi.fn()) {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [spellcheck({ checker: () => es, onMenu })] }),
    parent: document.body,
  });
  return view;
}

const marked = (v: EditorView) =>
  [...v.dom.querySelectorAll(".cm-spell-error")].map((e) => e.textContent);

describe("ortografía en el editor", () => {
  it("subraya solo las palabras de la prosa mal escritas", async () => {
    const v = editor(
      "\\section{Introduccion} El campo electrico $\\vec{E} = qq$ vale \\ref{fig:graficoo}.",
    );
    await waitFor(() => expect(marked(v)).toEqual(["Introduccion", "electrico"]));
  });

  it("al escribir se vuelve a revisar", async () => {
    const v = editor("Texto correcto.");
    await waitFor(() => expect(v.dom.querySelector(".cm-spell-error")).toBeNull());
    v.dispatch({ changes: { from: 0, insert: "Palabrra " } });
    await waitFor(() => expect(marked(v)).toEqual(["Palabrra"]));
  });

  it("clic derecho sobre una palabra marcada abre el menú; la sugerencia la reemplaza", async () => {
    const onMenu = vi.fn();
    const v = editor("La ecuacion final.", onMenu);
    await waitFor(() => expect(marked(v)).toEqual(["ecuacion"]));
    // jsdom has no layout: point the click at the word's position.
    vi.spyOn(v, "posAtCoords").mockReturnValue(5);
    v.contentDOM.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }),
    );
    expect(onMenu).toHaveBeenCalledTimes(1);
    const word = onMenu.mock.calls[0][1] as MisspelledWord;
    expect(word).toMatchObject({ word: "ecuacion", from: 3, to: 11, x: 10, y: 20 });
    expect(await es.suggest(word.word)).toContain("ecuación");
    replaceWord(v, word, "ecuación");
    expect(v.state.doc.toString()).toBe("La ecuación final.");
  });

  it("sin verificador (idioma desactivado) no marca nada", async () => {
    view = new EditorView({
      state: EditorState.create({
        doc: "Palabrra",
        extensions: [spellcheck({ checker: () => null, onMenu: vi.fn() })],
      }),
      parent: document.body,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(view.dom.querySelector(".cm-spell-error")).toBeNull();
  });
});

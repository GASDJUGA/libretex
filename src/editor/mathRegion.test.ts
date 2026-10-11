import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { latex } from "codemirror-lang-latex";
import { describe, expect, it } from "vitest";
import { MATH_CASES, withCursor } from "../lib/latexMath/cases";
import { MATH_ENVS } from "../lib/latexMath/regions";
import { mathRegionInState } from "./mathRegion";

function stateFor(text: string) {
  const state = EditorState.create({ doc: text, extensions: [latex()] });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

describe("mathRegionInState (árbol sintáctico)", () => {
  for (const c of MATH_CASES) {
    it(c.name, () => {
      const { text, pos } = withCursor(c.text);
      const region = mathRegionInState(stateFor(text), pos);
      if (!c.expected) {
        expect(region).toBeNull();
        return;
      }
      expect(region).not.toBeNull();
      expect(text.slice(region!.bodyFrom, region!.bodyTo)).toBe(c.expected.body);
      expect(region!.display).toBe(c.expected.display);
      expect(region!.env).toBe(c.expected.env ?? null);
      expect(region!.unclosed).toBe(c.expected.unclosed ?? false);
    });
  }

  it("todos los entornos matemáticos, con y sin asterisco", () => {
    for (const env of MATH_ENVS) {
      for (const name of [env, `${env}*`]) {
        const text = `\\begin{${name}} a \\end{${name}}`;
        expect(mathRegionInState(stateFor(text), text.indexOf(" a ") + 1)?.env).toBe(name);
      }
    }
  });

  it("sin árbol completo, decide el escáner", () => {
    // A state without the LaTeX language has an empty tree.
    const text = "Texto $a+b$ fin";
    const state = EditorState.create({ doc: text });
    expect(mathRegionInState(state, 8)?.bodyFrom).toBe(7);
  });
});

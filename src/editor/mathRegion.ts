import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { MATH_ENVS, mathRegionAt, type MathRegion } from "../lib/latexMath/regions";

/** A node of the syntax tree (type from @lezer/common, without depending on it directly). */
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

const MATH_ENV = new Set<string>(MATH_ENVS.flatMap((e) => [e, `${e}*`]));

/** Delimited math nodes of the LaTeX grammar, with their opening/closing delimiters. */
const DELIMITED: Record<string, { display: boolean; delimiters: [string, string][] }> = {
  DollarMath: {
    display: false,
    delimiters: [
      ["$$", "$$"],
      ["$", "$"],
    ],
  },
  ParenMath: { display: false, delimiters: [["\\(", "\\)"]] },
  BracketMath: { display: true, delimiters: [["\\[", "\\]"]] },
};

function delimitedRegion(state: EditorState, node: SyntaxNode): MathRegion | null {
  const spec = DELIMITED[node.name];
  const text = state.sliceDoc(node.from, node.to);
  const [open, close] = spec.delimiters.find(([o]) => text.startsWith(o)) ?? [];
  if (!open || !close) return null;
  const closed = text.length >= open.length + close.length && text.endsWith(close);
  return {
    from: node.from,
    to: node.to,
    bodyFrom: node.from + open.length,
    bodyTo: closed ? node.to - close.length : node.to,
    display: open === "$$" || spec.display,
    env: null,
    unclosed: !closed,
  };
}

/** A `\begin{…}…\end{…}` node of a math environment. */
function environmentRegion(state: EditorState, node: SyntaxNode): MathRegion | null {
  const begin = node.getChild("BeginEnv");
  const nameGroup = begin?.getChild("EnvNameGroup");
  if (!begin || !nameGroup) return null;
  const name = state.sliceDoc(nameGroup.from + 1, nameGroup.to - 1).trim();
  if (!MATH_ENV.has(name)) return null;
  const end = node.getChild("EndEnv");
  return {
    from: node.from,
    to: node.to,
    bodyFrom: begin.to,
    bodyTo: end ? end.from : node.to,
    display: true,
    env: name,
    unclosed: !end,
  };
}

/** The outermost math region of the syntax tree around `pos`, if any. */
function fromTree(state: EditorState, pos: number): MathRegion | null {
  const tree = syntaxTree(state);
  let found: MathRegion | null = null;
  for (const side of [-1, 1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      const region =
        node.name in DELIMITED
          ? delimitedRegion(state, node)
          : node.getChild("BeginEnv")
            ? environmentRegion(state, node)
            : null;
      if (region && region.bodyFrom <= pos && pos <= region.bodyTo) found = region;
    }
    if (found) return found;
  }
  return null;
}

/**
 * The math region whose body contains `pos`. Uses the syntax tree (incremental, already
 * parsed by the editor); where the tree is not complete yet, or for a region that the
 * grammar extends over a paragraph break (TeX ends math there), the text scanner decides.
 */
export function mathRegionInState(state: EditorState, pos: number): MathRegion | null {
  const tree = syntaxTree(state);
  if (tree.length < pos) return mathRegionAt(state.doc.toString(), pos);
  const region = fromTree(state, pos);
  if (region && !region.env && /\n[ \t]*\n/.test(state.sliceDoc(region.bodyFrom, region.bodyTo))) {
    return mathRegionAt(state.doc.toString(), pos);
  }
  // The grammar sometimes loses inline math around certain commands (`$\part$`: it takes
  // \part for sectioning). Inline and display math never cross a paragraph: the scanner
  // checks just this one.
  return region ?? paragraphRegion(state, pos);
}

/** The scanner's math region at `pos`, looking only at the paragraph around it. */
function paragraphRegion(state: EditorState, pos: number): MathRegion | null {
  const { doc } = state;
  let first = doc.lineAt(pos).number;
  let last = first;
  while (first > 1 && doc.line(first - 1).text.trim() !== "") first--;
  while (last < doc.lines && doc.line(last + 1).text.trim() !== "") last++;
  const from = doc.line(first).from;
  const region = mathRegionAt(state.sliceDoc(from, doc.line(last).to), pos - from);
  // Environments are the tree's business (they may hold blank lines).
  if (!region || region.env) return null;
  return {
    ...region,
    from: region.from + from,
    to: region.to + from,
    bodyFrom: region.bodyFrom + from,
    bodyTo: region.bodyTo + from,
  };
}

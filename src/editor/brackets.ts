/**
 * Automatic closing of brackets, and what the dead `^` key of Spanish/Latin American
 * keyboards composes: `^` + `{` arrives as a single «^{» (CodeMirror only closes brackets
 * typed alone) and, inside math, `^2` arrives as «²» and `^a` as «â».
 */
import { insertBracket } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { mathRegionInState } from "./mathRegion";

/**
 * Only {} [] () and $ are closed automatically: the language's default also pairs ' and ",
 * which gets in the way of ``quotes'' and apostrophes in prose.
 */
export const LATEX_CLOSE_BRACKETS = ["(", "[", "{", "$"];

/**
 * Characters in front of which a typed bracket is closed: CodeMirror's defaults plus `$`
 * (`{` typed inside `$|$`) and, when what follows closes or spaces something (`\]`, `\)`,
 * `\\`, `\,`, `\right`, `\end`), the backslash: in display math the cursor is often right
 * before `\]`. Not before other commands (`(|\frac`), which are usually being wrapped.
 * Right after `^` or `_` it is always closed (pedido del usuario: un exponente que faltaba,
 * `x^{|}y`): a superscript or subscript is not wrapped around what follows.
 */
export function closeBracketsBefore(state: EditorState, pos: number): string {
  const after = state.sliceDoc(pos, pos + 8);
  const before = /^\\(?:[^A-Za-z]|right(?![A-Za-z])|end(?![A-Za-z]))/.test(after)
    ? ")]}:;>$\\"
    : ")]}:;>$";
  const previous = pos > 0 ? state.sliceDoc(pos - 1, pos) : "";
  return previous === "^" || previous === "_" ? before + after.slice(0, 1) : before;
}

/** What the dead `^` composes with digits, signs and parentheses, and the key typed. */
const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ";
const SUPERSCRIPT_KEYS = "0123456789+-=()in";

/**
 * Inside math, the `^x` the user meant by a character the dead `^` composed (`²` → `^2`,
 * `⁽` → `^(`, `â` → `^a`); null for any other text.
 */
export function deadCircumflexInMath(text: string): string | null {
  if (text.length !== 1) return null;
  const superscript = SUPERSCRIPTS.indexOf(text);
  if (superscript >= 0) return `^${SUPERSCRIPT_KEYS[superscript]}`;
  const parts = text.normalize("NFD");
  if (parts.length === 2 && parts[1] === "̂") return `^${parts[0]}`;
  return null;
}

/**
 * Text composed with a dead key: inside math the `^x` that was meant, and a trailing
 * bracket closed as if it had been typed alone (`^{` → `^{|}`).
 */
export const deadKeyInput = EditorView.inputHandler.of((view, from, to, text) => {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length > 1) return false;
  const meant = mathRegionInState(state, from) ? deadCircumflexInMath(text) : null;
  const typed = meant ?? text;
  const open = typed[typed.length - 1];
  const closes = typed.length >= 2 && LATEX_CLOSE_BRACKETS.includes(open);
  if (!meant && !closes) return false;
  const prefix = closes ? typed.slice(0, -1) : typed;
  view.dispatch({
    changes: { from, to, insert: prefix },
    selection: { anchor: from + prefix.length },
    userEvent: "input.type",
  });
  if (closes) {
    const bracket = insertBracket(view.state, open);
    if (bracket) view.dispatch(bracket);
    else view.dispatch({ ...view.state.replaceSelection(open), userEvent: "input.type" });
  }
  return true;
});

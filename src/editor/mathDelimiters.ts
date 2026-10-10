import { EditorView } from "@codemirror/view";

const CLOSING: Record<string, string> = { "[": "\\]", "(": "\\)" };

/** Number of consecutive backslashes right before `pos`. */
function backslashesBefore(text: string, pos: number) {
  let count = 0;
  while (pos - count - 1 >= 0 && text[pos - count - 1] === "\\") count++;
  return count;
}

/**
 * Typing `[` or `(` right after a single backslash completes the math delimiter pair:
 * `\[|\]`, `\(|\)`. An even number of backslashes is a line break (`\\[2pt]`) and is left
 * alone.
 */
export const mathDelimiters = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || view.state.selection.ranges.length > 1) return false;
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  const after = line.text.slice(from - line.from);

  if (text in CLOSING && backslashesBefore(before, before.length) % 2 === 1) {
    view.dispatch({
      changes: { from, insert: text + CLOSING[text] },
      selection: { anchor: from + 1 },
      userEvent: "input.type",
    });
    return true;
  }
  // Typing the closing delimiter by hand in front of an auto-inserted one steps over it,
  // one character at a time: `\` over the backslash, then `]`/`)` over the bracket.
  const closing = after.slice(0, 2);
  const opening = closing === "\\]" ? "\\[" : closing === "\\)" ? "\\(" : null;
  if (
    text === "\\" &&
    opening &&
    before.includes(opening) &&
    backslashesBefore(before, before.length) % 2 === 0
  ) {
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: "select" });
    return true;
  }
  if (
    (text === "]" || text === ")") &&
    after.startsWith(text) &&
    backslashesBefore(before, before.length) % 2 === 1 &&
    before.includes(text === "]" ? "\\[" : "\\(")
  ) {
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: "select" });
    return true;
  }
  return false;
});

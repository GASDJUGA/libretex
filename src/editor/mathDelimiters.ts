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
  // Typing the closing delimiter by hand in front of the auto-inserted one: `\` is always
  // inserted (it may start a command, `\[\int|\]`), and only when the `]`/`)` that
  // completes `\]`/`\)` arrives is that extra backslash dropped and the cursor moved past
  // the existing closer.
  if (
    (text === "]" || text === ")") &&
    after.startsWith(text === "]" ? "\\]" : "\\)") &&
    backslashesBefore(before, before.length) % 2 === 1 &&
    before.slice(0, -1).includes(text === "]" ? "\\[" : "\\(")
  ) {
    view.dispatch({
      changes: { from: from - 1, to: from },
      selection: { anchor: from + 1 },
      userEvent: "input.type",
    });
    return true;
  }
  return false;
});

import { EditorState } from "@codemirror/state";

/**
 * `\left(` gets its `\right)` (pedido del usuario: como los entornos), also `\left[`,
 * `\left\{`, `\left|`, `\left\langle`… and the sized pairs `\bigl(` → `\bigr)`. The cursor
 * stays between them; Tab jumps past the `\right)` (mathTab.ts).
 */

/** Opening delimiter → its closing one. */
const DELIMITERS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "\\{": "\\}",
  "|": "|",
  "\\|": "\\|",
  ".": ".",
  "/": "/",
  "\\langle": "\\rangle",
  "\\lvert": "\\rvert",
  "\\lVert": "\\rVert",
  "\\lfloor": "\\rfloor",
  "\\lceil": "\\rceil",
  "\\lbrack": "\\rbrack",
  "\\lbrace": "\\rbrace",
  "\\lgroup": "\\rgroup",
  "\\lmoustache": "\\rmoustache",
  "\\vert": "\\vert",
  "\\Vert": "\\Vert",
};

/** `\left` and the sized openers, with what closes them. */
const OPENERS: Record<string, string> = {
  left: "right",
  bigl: "bigr",
  Bigl: "Bigr",
  biggl: "biggr",
  Biggl: "Biggr",
};

const escape = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
const DELIMITER = Object.keys(DELIMITERS)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join("|");
/** `\left(` at the end of the text (an odd number of backslashes before `left`). */
const OPEN_AT_END = new RegExp(
  String.raw`(?:^|[^\\])(?:\\\\)*\\(${Object.keys(OPENERS).join("|")})\s*(${DELIMITER})$`,
);

/**
 * The closing pair for the opener that `before` ends with (`x + \left(` → `\right)`), or
 * null. A delimiter made of letters must be complete: `\left\lang` gives nothing.
 */
export function closingPair(before: string, next = ""): string | null {
  const match = OPEN_AT_END.exec(before);
  if (!match) return null;
  const delimiter = match[2];
  // `\left\lvert` typed as far as `\left\lv`… is not this; letters after it neither.
  if (/[A-Za-z]$/.test(delimiter) && /^[A-Za-z]/.test(next)) return null;
  return `\\${OPENERS[match[1]]}${DELIMITERS[delimiter]}`;
}

/** Closers that closeBrackets adds after an opener it closed (`(` → `()`). */
const AUTO_CLOSED: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/**
 * After typing or completing the delimiter of `\left`, inserts the matching `\right…` right
 * after the cursor, in the same transaction (one undo step). If closeBrackets already closed
 * the bracket (`\left(|)`), its `)` becomes the `\right)`.
 */
export const leftRightPairs = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent("input.type") || tr.isUserEvent("input.complete"))) {
    return tr;
  }
  const { state } = tr;
  const selection = state.selection;
  if (selection.ranges.length > 1 || !selection.main.empty) return tr;
  const head = selection.main.head;
  // What this transaction inserted, ending at the cursor (or with an auto-closed bracket
  // right after it).
  let inserted = "";
  let insertedTo = -1;
  tr.changes.iterChanges((_fromA, _toA, _fromB, toB, text) => {
    inserted = text.toString();
    insertedTo = toB;
  });
  if (!inserted) return tr;
  const autoClosed =
    insertedTo === head + 1 &&
    inserted.length >= 2 &&
    AUTO_CLOSED[inserted.at(-2)!] === inserted.at(-1)
      ? 1
      : 0;
  if (insertedTo !== head + autoClosed) return tr;

  const line = state.doc.lineAt(head);
  const before = state.sliceDoc(Math.max(line.from, head - 40), head);
  const next = state.sliceDoc(head + autoClosed, head + autoClosed + 1);
  const closer = closingPair(before, next);
  if (!closer) return tr;
  // Already closed right there (retyping the opener of an existing pair): only drop the
  // bracket closeBrackets added.
  if (state.sliceDoc(head + autoClosed, head + autoClosed + closer.length) === closer) {
    return autoClosed
      ? [
          tr,
          { changes: { from: head, to: head + 1 }, selection: { anchor: head }, sequential: true },
        ]
      : tr;
  }
  return [
    tr,
    {
      changes: { from: head, to: head + autoClosed, insert: closer },
      selection: { anchor: head },
      sequential: true,
    },
  ];
});

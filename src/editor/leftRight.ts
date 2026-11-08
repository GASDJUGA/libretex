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

/** `\left`/`\right` (or the sized words) not preceded by another backslash. */
const pairWords = (open: string, close: string) =>
  new RegExp(String.raw`(?<!\\)\\(${open}|${close})(?![A-Za-z])`, "g");

/**
 * Whether the `\right…` right after the cursor is still missing its `\left` (the opener of an
 * existing pair being typed again), rather than closing an opener before it: `before` ends
 * with the opener just typed, `after` starts with the closer. A new pair goes inside one that
 * is complete (`\left( \left(|\right)`).
 */
export function closerLacksOpener(before: string, after: string, open: string, close: string) {
  const words = pairWords(open, close);
  // Openers still open before the cursor, without the one just typed (the last).
  let depth = 0;
  for (const m of before.matchAll(words))
    depth = m[1] === open ? depth + 1 : Math.max(0, depth - 1);
  const stillOpen = depth - 1;
  // Closers after the cursor that need an opener from before it.
  let inside = 0;
  let needed = 0;
  for (const m of after.matchAll(words)) {
    if (m[1] === open) inside++;
    else if (inside > 0) inside--;
    else needed++;
  }
  return needed > Math.max(0, stillOpen);
}

/** The paragraph's text around `at` (up to a blank line), at most `limit` characters each way. */
function paragraphAround(state: EditorState, at: number, limit = 3000) {
  const before = state.sliceDoc(Math.max(0, at - limit), at);
  const after = state.sliceDoc(at, at + limit);
  const start = before.lastIndexOf("\n\n");
  const end = after.indexOf("\n\n");
  return {
    before: start < 0 ? before : before.slice(start + 2),
    after: end < 0 ? after : after.slice(0, end),
  };
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
  // Already closed right there by a closer missing its opener (retyping the opener of an
  // existing pair): only drop the bracket closeBrackets added.
  const closeWord = /^\\([A-Za-z]+)/.exec(closer)![1];
  const openWord = Object.keys(OPENERS).find((word) => OPENERS[word] === closeWord)!;
  const around = paragraphAround(state, head + autoClosed);
  if (
    state.sliceDoc(head + autoClosed, head + autoClosed + closer.length) === closer &&
    closerLacksOpener(around.before, around.after, openWord, closeWord)
  ) {
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

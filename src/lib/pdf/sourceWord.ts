/**
 * SyncTeX reports only the line of a point in the PDF (never the column). To land on the
 * double-clicked word, the word and its neighbours in the PDF are looked up in the source
 * around that line.
 */

/** A word clicked in the PDF and the words around it on the same PDF line. */
export type PdfWord = { text: string; before: string; after: string };

const LETTER = /[\p{L}\p{N}]/u;

/** Lowercase, without accents or ligatures; `map[i]` is the source index of character `i`. */
export function fold(text: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const folded = char.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < folded.length; k++) map.push(index);
    out += folded;
    index += char.length;
  }
  map.push(index);
  return { text: out, map };
}

/** Removes command names (`\emph`, `\vec`…): in the source they sit between words. */
const withoutCommands = (text: string) => text.replace(/\\[a-zA-Z@]+\*?/g, " ");
/** Last word of `text` (letters and digits only, commands skipped), folded. */
const lastWord = (text: string) =>
  fold(withoutCommands(text)).text.match(/[\p{L}\p{N}]+(?=[^\p{L}\p{N}]*$)/u)?.[0] ?? "";
/** First word of `text` (commands skipped), folded. */
const firstWord = (text: string) =>
  fold(withoutCommands(text)).text.match(/[\p{L}\p{N}]+/u)?.[0] ?? "";

/**
 * The word at `offset` in a text-layer string (`selected` is what the double click
 * selected) with the previous and next words, for disambiguation.
 */
export function wordAt(line: string, offset: number, selected: string): PdfWord | null {
  // A hyphenated word broken across PDF lines keeps its hyphen in the selection.
  const text = selected.trim().replace(/[-‐‑]$/u, "");
  if (!text || !LETTER.test(text)) return null;
  const start = Math.max(0, Math.min(offset, line.length));
  return {
    text,
    before: line.slice(0, start),
    after: line.slice(start + selected.length),
  };
}

/** Bounds of the word (letters and digits) that contains `offset` in `text`. */
export function wordBounds(text: string, offset: number): { start: number; end: number } {
  let start = Math.max(0, Math.min(offset, text.length));
  let end = start;
  while (start > 0 && LETTER.test(text[start - 1])) start--;
  while (end < text.length && LETTER.test(text[end])) end++;
  return { start, end };
}

/** Lines searched on each side of the line that SyncTeX reports. */
const RADIUS = 12;

/**
 * Position of `word` in `lines` (0-based line index, character range) closest to the 1-based
 * `line`, preferring matches whose neighbouring words also match; null if it is not there
 * (for instance, an accent typed as `\'e` in the source).
 */
export function locateWord(
  lines: readonly string[],
  line: number,
  word: PdfWord,
): { line: number; from: number; to: number } | null {
  const target = fold(word.text).text;
  if (!target) return null;
  const prev = lastWord(word.before);
  const next = firstWord(word.after);
  const center = Math.min(Math.max(line - 1, 0), lines.length - 1);

  let best: { score: number; line: number; from: number; to: number } | null = null;
  for (
    let i = Math.max(0, center - RADIUS);
    i <= Math.min(lines.length - 1, center + RADIUS);
    i++
  ) {
    const source = fold(lines[i]);
    for (let at = source.text.indexOf(target); at >= 0; at = source.text.indexOf(target, at + 1)) {
      const end = at + target.length;
      let score = -Math.abs(i - center);
      const whole = !LETTER.test(source.text[at - 1] ?? "") && !LETTER.test(source.text[end] ?? "");
      if (whole) score += 3;
      // The neighbouring words must be the adjacent ones in the source too (which may be
      // on the previous or the next source line).
      const from = source.map[at];
      const to = source.map[end];
      const before = `${i > 0 ? lines[i - 1] : ""}\n${lines[i].slice(0, from)}`;
      const after = `${lines[i].slice(to)}\n${i + 1 < lines.length ? lines[i + 1] : ""}`;
      if (prev && lastWord(before) === prev) score += 6;
      if (next && firstWord(after) === next) score += 6;
      if (!best || score > best.score) {
        best = { score, line: i, from, to };
      }
    }
  }
  return best && { line: best.line, from: best.from, to: best.to };
}

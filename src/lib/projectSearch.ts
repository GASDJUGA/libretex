/**
 * The project search of the browser preview (mock backend), with the same results as
 * src-tauri/src/files/search.rs. Regular expressions use JavaScript syntax here.
 */
import type { SearchMatch, SearchQuery, SearchResults } from "../store/types";

export const MAX_MATCHES = 5000;
const CONTEXT_BEFORE = 16;
const CONTEXT_MATCH = 200;
const CONTEXT_AFTER = 120;

const AUX =
  /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|gz|bbl|blg|bcf|xdv|dvi|nav|snm|idx|ind|ilg|pdf|xml)$/i;

/** Files of LaTeX tools: not searched. */
export const isAuxiliary = (path: string) => AUX.test(path);

/** The query as a global regular expression; throws a message if it is not valid. */
export function searchRegExp(query: SearchQuery): RegExp {
  if (!query.text) throw new Error("la búsqueda está vacía");
  let pattern = query.regex
    ? `(?:${query.text})`
    : query.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (query.wholeWord) pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
  return new RegExp(pattern, `gmu${query.caseSensitive ? "" : "i"}`);
}

const chars = (s: string) => [...s];

function tail(s: string, max: number) {
  const all = chars(s);
  return all.length <= max ? s.trimStart() : `…${all.slice(-max).join("")}`;
}

function head(s: string, max: number) {
  const all = chars(s);
  return all.length <= max ? s : `${all.slice(0, max).join("")}…`;
}

/** Occurrences of `re` in `text` (empty matches skipped), at most `limit`. */
export function findInText(re: RegExp, text: string, limit: number): SearchMatch[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineAt = (offset: number) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
    return line;
  };
  const lineEnd = (line: number) => {
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    return text[end - 1] === "\r" ? end - 1 : end;
  };
  const matches: SearchMatch[] = [];
  for (const m of text.matchAll(re)) {
    if (matches.length >= limit) break;
    if (m[0].length === 0) continue;
    const start = m.index;
    const end = start + m[0].length;
    const line = lineAt(start);
    const endLine = lineAt(end);
    const shownEnd = Math.max(start, Math.min(end, lineEnd(line)));
    matches.push({
      line: line + 1,
      column: start - starts[line],
      endLine: endLine + 1,
      endColumn: end - starts[endLine],
      before: tail(text.slice(starts[line], start), CONTEXT_BEFORE),
      text: head(text.slice(start, shownEnd), CONTEXT_MATCH),
      after: head(text.slice(shownEnd, lineEnd(line)), CONTEXT_AFTER),
    });
  }
  return matches;
}

/** Search over `files` (path, content), sorted by path. */
export function searchFiles(files: [string, string][], query: SearchQuery): SearchResults {
  const re = searchRegExp(query);
  const results: SearchResults = { files: [], truncated: false };
  let total = 0;
  for (const [path, content] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (isAuxiliary(path) || path.split("/").some((part) => part.startsWith("."))) continue;
    const matches = findInText(re, content, MAX_MATCHES + 1 - total);
    if (total + matches.length > MAX_MATCHES) {
      matches.length = MAX_MATCHES - total;
      results.truncated = true;
    }
    total += matches.length;
    if (matches.length > 0) results.files.push({ path, matches });
    if (results.truncated) break;
  }
  return results;
}

/** `text` with the occurrences replaced (`$1` groups only for regular expressions). */
export function replaceText(text: string, query: SearchQuery, replacement: string) {
  const re = searchRegExp(query);
  let count = 0;
  const result = text.replace(re, (...args) => {
    const match = args[0] as string;
    if (match.length === 0) return match;
    count++;
    if (!query.regex) return replacement;
    // replace() passes the match, its groups, the offset (a number), the text and, with
    // named groups, an object with them.
    const offset = args.findIndex((a, i) => i > 0 && typeof a === "number");
    const groups = args.slice(1, offset) as (string | undefined)[];
    const named = (typeof args.at(-1) === "object" ? args.at(-1) : {}) as Record<string, string>;
    return replacement.replace(/\$(\d+)|\$\{(\w+)\}/g, (_, n: string, name: string) =>
      n ? (groups[Number(n) - 1] ?? "") : (named[name] ?? ""),
    );
  });
  return { text: result, count };
}

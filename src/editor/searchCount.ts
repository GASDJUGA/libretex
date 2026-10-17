import type { EditorState } from "@codemirror/state";
import type { SearchQuery } from "@codemirror/search";

/** Matches counted at most (the bar then says «1000+»). */
export const MAX_COUNTED = 1000;

export type MatchCount = {
  /** 1-based index of the match at the selection, or 0 if the selection is not one. */
  current: number;
  total: number;
  /** There are more than `total`. */
  capped: boolean;
};

/** How many matches `query` has in `state` and which one is selected. */
export function countMatches(state: EditorState, query: SearchQuery): MatchCount {
  if (!query.search || !query.valid) return { current: 0, total: 0, capped: false };
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current = 0;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++;
    if (next.value.from === from && next.value.to === to) current = total;
    if (total >= MAX_COUNTED) return { current, total, capped: !cursor.next().done };
  }
  return { current, total, capped: false };
}

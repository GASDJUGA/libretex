import { useState } from "react";

/**
 * How a view comes in when another takes its place in an ordered row (tabs, sections, side
 * panels): from the side of the one it replaces. `forward` = it is after the previous one (to
 * the right, or below); `back` = before it; `none` = the first one shown.
 */
export type Entrance = "forward" | "back" | "none";

export function entranceFor(previous: number | null, next: number): Entrance {
  if (previous === null) return "none";
  return next >= previous ? "forward" : "back";
}

/**
 * The entrance of the view shown under `key`, at position `order` in its row. It changes only
 * when `key` changes, so re-renders of the same view don't replay it.
 */
export function useEntrance(key: string, order: number): Entrance {
  const [shown, setShown] = useState<{ key: string; order: number; entrance: Entrance }>({
    key,
    order,
    entrance: "none",
  });
  if (shown.key === key) return shown.entrance;
  const next = { key, order, entrance: entranceFor(shown.order, order) };
  setShown(next);
  return next.entrance;
}

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

/**
 * Holds the entrance animation of a view that was just mounted until its first frame is
 * drawn. Mounting a project can keep the page busy for a few hundred milliseconds, and an
 * animation that started then was already over when the view first appeared (pedido del
 * usuario: el cambio entre proyectos se veía instantáneo). The view is rendered with
 * `lt-hold` (paused at its start, so it shows the first keyframe); this lets it play.
 * Returns the cleanup for a layout effect.
 */
export function playOnFirstFrame(element: HTMLElement | null): () => void {
  if (!element) return () => {};
  const play = () => element.classList.remove("lt-hold");
  const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(play) : 0;
  // In case frames don't come (a hidden window): never stay invisible.
  const timer = setTimeout(play, 500);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(timer);
    play();
  };
}

/**
 * The same, as a ref for an element that is mounted with `lt-hold` (stable: React calls it
 * once when the element is mounted, and its cleanup when it goes).
 */
export const holdUntilDrawn = (element: HTMLElement | null) =>
  element ? playOnFirstFrame(element) : undefined;

/** Where animations run (not in jsdom, which has no Web Animations). */
export const canAnimate = () =>
  typeof Element !== "undefined" && typeof Element.prototype.getAnimations === "function";

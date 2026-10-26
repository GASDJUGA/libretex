import type { KeyboardEvent } from "react";

/**
 * Keyboard of a tab (ARIA tabs pattern): ←/→ (and Home/End) move between the tabs of its
 * tablist, Delete closes it. Returns whether the key was used.
 */
export function onTabKey(e: KeyboardEvent<HTMLElement>, close?: () => void): boolean {
  if (e.key === "Delete" && close) {
    e.preventDefault();
    close();
    return true;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return false;
  const list = e.currentTarget.closest("[role=tablist]");
  const tabs = Array.from(list?.querySelectorAll<HTMLElement>("[role=tab]") ?? []);
  const index = tabs.indexOf(e.currentTarget);
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[next]?.focus();
  return true;
}

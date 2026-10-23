// Positioning of dropdown menus (see components/common/Menu.tsx).

/** Gap between the trigger and the menu, and minimum margin to the window edges. */
const GAP = 4;
const MARGIN = 8;

/**
 * Fixed position for the menu next to its trigger: below it, or above when it does not fit;
 * aligned to the trigger's start or end edge and kept inside the window. With `"right"`, beside
 * the trigger (a button of the icon rail), starting at its top.
 */
export function menuPosition(
  trigger: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end" | "right",
): { top: number; left: number } {
  if (align === "right") {
    return {
      top: Math.max(MARGIN, Math.min(trigger.top, viewport.height - MARGIN - menu.height)),
      left: Math.max(MARGIN, Math.min(trigger.right + GAP, viewport.width - MARGIN - menu.width)),
    };
  }
  const below = trigger.bottom + GAP;
  const above = trigger.top - GAP - menu.height;
  const fitsBelow = below + menu.height <= viewport.height - MARGIN;
  const top = fitsBelow || above < MARGIN ? below : above;
  const left = align === "end" ? trigger.right - menu.width : trigger.left;
  return {
    top: Math.max(MARGIN, Math.min(top, viewport.height - MARGIN - menu.height)),
    left: Math.max(MARGIN, Math.min(left, viewport.width - MARGIN - menu.width)),
  };
}

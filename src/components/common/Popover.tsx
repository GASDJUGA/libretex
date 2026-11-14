import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { animateLeave } from "../../lib/leaveAnimation";
import { menuPosition } from "../../lib/menuPosition";

type PopoverProps = {
  /** Contents of the trigger button. */
  trigger: ReactNode;
  label: string;
  triggerClassName: string;
  /** Panel contents; `close` hides the panel. */
  children: (close: () => void) => ReactNode;
};

/** A button that opens a floating panel (portaled, fixed, kept inside the window). */
export function Popover({ trigger, label, triggerClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Closing, the panel fades out (a copy, like the dialogs and menus).
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    return () => animateLeave(panel);
  }, [open]);

  const place = (el: HTMLDivElement | null) => {
    panelRef.current = el;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!el || !rect) return;
    // Its layout size: the opening animation scales it a little.
    const { offsetWidth: width, offsetHeight: height } = el;
    const { top, left } = menuPosition(
      rect,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
      "start",
    );
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={place}
            role="dialog"
            aria-label={label}
            style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
            className="jt-pop z-[80] rounded-md border border-line bg-panel-raised p-2 text-fg shadow-xl"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

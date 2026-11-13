import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { animateLeave } from "../../lib/leaveAnimation";
import { menuPosition } from "../../lib/menuPosition";

export type MenuEntry =
  | {
      kind?: "item";
      label: string;
      shortcut?: string;
      disabled?: boolean;
      /** Renders a check mark; makes the entry a checkbox/radio item. */
      checked?: boolean;
      radio?: boolean;
      hint?: string;
      /** Renders the item in red (destructive actions). */
      danger?: boolean;
      onSelect?: () => void;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

type Anchor = Pick<DOMRect, "top" | "bottom" | "left" | "right">;

type MenuPopupProps = {
  id?: string;
  label?: string;
  entries: MenuEntry[];
  /** Rectangle the menu is placed next to (a trigger button, or a point for context menus). */
  anchor: () => Anchor | undefined;
  align: "start" | "end" | "right";
  /** Elements whose clicks do not close the menu (its trigger). */
  inside?: () => HTMLElement | null;
  /** Called to close the menu; `afterSelect` is true when an item was chosen. */
  onClose: (afterSelect: boolean) => void;
};

/**
 * The open list of a menu: portaled to <body> with fixed positioning (so containers with
 * `overflow` cannot clip it), arrow-key navigation, Escape, and closing on outside clicks,
 * scroll or resize.
 */
function MenuPopup({ id, label, entries, anchor, align, inside, onClose }: MenuPopupProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Latest callbacks, so the listeners below are installed once per opening.
  const onCloseRef = useRef(onClose);
  const insideRef = useRef(inside);
  useEffect(() => {
    onCloseRef.current = onClose;
    insideRef.current = inside;
  });

  const place = (el: HTMLDivElement | null) => {
    listRef.current = el;
    const rect = anchor();
    if (!el || !rect) return;
    // Its layout size: the opening animation scales it a little.
    const { offsetWidth: width, offsetHeight: height } = el;
    const { top, left } = menuPosition(
      rect,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
      align,
    );
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  };

  // Closing, it fades out (a copy, like the dialogs).
  useLayoutEffect(() => {
    const list = listRef.current;
    return () => animateLeave(list);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!listRef.current?.contains(target) && !insideRef.current?.()?.contains(target)) {
        onCloseRef.current(false);
      }
    };
    // A fixed menu would drift away from its anchor: close it instead.
    const onScrollOrResize = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) onCloseRef.current(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("scroll", onScrollOrResize, true);
    listRef.current?.querySelector<HTMLElement>("[role^=menuitem]:not([disabled])")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current(false);
      return;
    }
    // Tab leaves the menu, as in native menus.
    if (e.key === "Tab") {
      onCloseRef.current(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? index + 1
            : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return createPortal(
    <div
      ref={place}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="lt-pop z-[80] max-h-[calc(100vh-16px)] min-w-52 overflow-y-auto rounded-md border border-line bg-panel-raised py-1 shadow-xl"
    >
      {entries.map((entry, i) => {
        if (entry.kind === "separator") {
          return <div key={i} role="separator" className="my-1 border-t border-line" />;
        }
        if (entry.kind === "label") {
          return (
            <div key={i} className="px-3 pt-2 pb-1 text-xs font-medium text-fg-muted uppercase">
              {entry.label}
            </div>
          );
        }
        const role =
          entry.checked === undefined
            ? "menuitem"
            : entry.radio
              ? "menuitemradio"
              : "menuitemcheckbox";
        return (
          <button
            key={i}
            type="button"
            role={role}
            aria-checked={entry.checked}
            aria-keyshortcuts={entry.shortcut}
            disabled={entry.disabled}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover focus:outline-none focus-visible:bg-hover disabled:opacity-45 disabled:hover:bg-transparent ${
              entry.danger ? "text-danger" : "text-fg"
            }`}
            onClick={() => {
              onClose(true);
              entry.onSelect?.();
            }}
          >
            <span className="flex w-4 justify-center">
              {entry.checked && <Check size={14} aria-hidden />}
            </span>
            <span className="flex-1 whitespace-nowrap">{entry.label}</span>
            {entry.hint && (
              <span className="text-xs whitespace-nowrap text-fg-muted">{entry.hint}</span>
            )}
            {entry.shortcut && (
              <kbd aria-hidden className="font-sans text-xs text-fg-muted">
                {entry.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

type MenuProps = {
  /** Contents of the trigger button. */
  trigger: ReactNode;
  /** Accessible name, needed when the trigger is only an icon. */
  label?: string;
  entries: MenuEntry[];
  align?: "start" | "end" | "right";
  triggerClassName?: string;
  title?: string;
};

const defaultTriggerClass =
  "flex h-8 items-center gap-1 rounded px-2 text-sm text-fg hover:bg-hover aria-expanded:bg-hover";

/** A button that opens a dropdown menu. */
export function Menu({
  trigger,
  label,
  entries,
  align = "start",
  triggerClassName = defaultTriggerClass,
  title,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <MenuPopup
          id={menuId}
          label={label}
          entries={entries}
          align={align}
          anchor={() => triggerRef.current?.getBoundingClientRect()}
          inside={() => triggerRef.current}
          onClose={(afterSelect) => {
            setOpen(false);
            // After choosing an item, focus may move to a dialog the item opened.
            if (!afterSelect) triggerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

type ContextMenuProps = {
  /** Viewport coordinates where the menu opens (the pointer position). */
  x: number;
  y: number;
  label?: string;
  entries: MenuEntry[];
  onClose: () => void;
};

/** A menu opened at the pointer, e.g. on right click. */
export function ContextMenu({ x, y, label, entries, onClose }: ContextMenuProps) {
  return (
    <MenuPopup
      label={label}
      entries={entries}
      align="start"
      anchor={() => ({ top: y, bottom: y, left: x, right: x })}
      onClose={onClose}
    />
  );
}

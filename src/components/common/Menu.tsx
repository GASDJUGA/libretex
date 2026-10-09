import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
      onSelect?: () => void;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

type MenuProps = {
  /** Contents of the trigger button. */
  trigger: ReactNode;
  /** Accessible name, needed when the trigger is only an icon. */
  label?: string;
  entries: MenuEntry[];
  align?: "start" | "end";
  triggerClassName?: string;
  title?: string;
};

const defaultTriggerClass =
  "flex h-8 items-center gap-1 rounded px-2 text-sm text-fg hover:bg-hover aria-expanded:bg-hover";

export function Menu({
  trigger,
  label,
  entries,
  align = "start",
  triggerClassName = defaultTriggerClass,
  title,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  /**
   * Places the menu (portaled to <body>, fixed) next to its trigger as soon as it mounts, so
   * containers with `overflow` (cards, scrolling lists, panels) cannot clip it.
   */
  const placeMenu = (el: HTMLDivElement | null) => {
    listRef.current = el;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!el || !trigger) return;
    const { width, height } = el.getBoundingClientRect();
    const { top, left } = menuPosition(
      trigger,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
      align,
    );
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    // A fixed menu would drift away from its trigger: close it instead.
    const onScrollOrResize = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
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
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not([disabled])") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
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
      {open &&
        createPortal(
          <div
            ref={placeMenu}
            id={menuId}
            role="menu"
            aria-label={label}
            style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
            className="z-[80] max-h-[calc(100vh-16px)] min-w-52 overflow-y-auto rounded-md border border-line bg-panel-raised py-1 shadow-xl"
          >
            {entries.map((entry, i) => {
              if (entry.kind === "separator") {
                return <div key={i} role="separator" className="my-1 border-t border-line" />;
              }
              if (entry.kind === "label") {
                return (
                  <div
                    key={i}
                    className="px-3 pt-2 pb-1 text-xs font-medium text-fg-muted uppercase"
                  >
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover focus:bg-hover focus:outline-none disabled:opacity-45 disabled:hover:bg-transparent"
                  onClick={() => {
                    entry.onSelect?.();
                    close();
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
        )}
    </div>
  );
}

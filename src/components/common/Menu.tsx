import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    listRef.current?.querySelector<HTMLElement>("[role^=menuitem]:not([disabled])")?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
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
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
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
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-50 mt-1 min-w-52 rounded-md border border-line bg-panel-raised py-1 shadow-xl ${
            align === "end" ? "right-0" : "left-0"
          }`}
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
                  <kbd className="font-sans text-xs text-fg-muted">{entry.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

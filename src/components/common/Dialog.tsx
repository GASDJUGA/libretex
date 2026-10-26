import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useT } from "../../i18n";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])";

type DialogProps = {
  title: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  /** Disables the submit button (e.g. invalid input or a pending request). */
  submitDisabled?: boolean;
  /** Renders the submit button in red, for destructive actions. */
  danger?: boolean;
  /** Error shown above the buttons. */
  error?: string;
  /** Label of the button that closes without submitting (default «Cancelar»). */
  cancelLabel?: string;
  /** Wider, for dialogs with a list. */
  wide?: boolean;
  /** Only the submit button (dialogs that just show something). */
  hideCancel?: boolean;
};

/**
 * Modal dialog with a form: Enter submits, Escape or clicking outside cancels. The first
 * input (or the submit button) receives focus.
 */
export function Dialog({
  title,
  children,
  submitLabel,
  onSubmit,
  onClose,
  submitDisabled,
  danger,
  error,
  cancelLabel,
  wide,
  hideCancel,
}: DialogProps) {
  const t = useT();
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Focus goes back where it was when the dialog closes (if that is still on the page).
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const form = formRef.current;
    const first = form?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), button[type=submit]",
    );
    first?.focus();
    if (first instanceof HTMLInputElement && first.type === "text") first.select();
    return () => {
      // Without scrolling: a plain focus() on the editor (contenteditable) scrolled it to
      // the start of the file in WebKitGTK.
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  /** Tab and Shift+Tab stay inside the dialog (it is modal). */
  const trapTab = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Tab") return;
    const focusable = Array.from(formRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !formRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !formRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitDisabled) onSubmit();
  };

  return (
    <div
      className="lt-dialog-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`lt-dialog w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-lg border border-line bg-panel p-5 text-fg shadow-2xl`}
      >
        <form
          ref={formRef}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
            trapTab(e);
          }}
          className="flex flex-col gap-4"
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="flex flex-col gap-3 text-sm">{children}</div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {!hideCancel && (
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-line px-4 text-sm hover:bg-hover"
              >
                {cancelLabel ?? t("common.cancel")}
              </button>
            )}
            <button
              type="submit"
              disabled={submitDisabled}
              className={`h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50 ${
                danger
                  ? "bg-danger text-topbar hover:brightness-110"
                  : "bg-accent text-accent-fg hover:bg-accent-hover"
              }`}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-line bg-topbar px-3 text-sm text-fg placeholder:text-fg-muted";

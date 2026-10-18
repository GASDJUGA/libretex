import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { useT } from "../../i18n";

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
}: DialogProps) {
  const t = useT();
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    const first = form?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), button[type=submit]",
    );
    first?.focus();
    if (first instanceof HTMLInputElement && first.type === "text") first.select();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitDisabled) onSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        className={`flex w-full ${wide ? "max-w-xl" : "max-w-md"} flex-col gap-4 rounded-lg border border-line bg-panel p-5 text-fg shadow-2xl`}
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
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-line px-4 text-sm hover:bg-hover"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
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
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-line bg-topbar px-3 text-sm text-fg placeholder:text-fg-muted";

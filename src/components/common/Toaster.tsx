import { CircleAlert, Info, X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useT } from "../../i18n";
import { animateLeave } from "../../lib/leaveAnimation";
import { useToasts } from "../../store/toasts";

/** One notice: it rises from the corner and, dismissed or expired, fades out. */
function Notice({
  role,
  className,
  children,
}: {
  role: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const notice = ref.current;
    return () => animateLeave(notice);
  }, []);
  return (
    <div ref={ref} role={role} className={`lt-toast ${className}`}>
      {children}
    </div>
  );
}

export function Toaster() {
  const t = useT();
  const { toasts, dismiss } = useToasts();

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <Notice
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex gap-3 rounded-md border bg-panel-raised p-3 text-sm shadow-xl ${
            toast.kind === "error" ? "border-danger/60" : "border-line"
          }`}
        >
          {toast.kind === "error" ? (
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-info" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p>{toast.title}</p>
            {toast.detail && (
              <p className="mt-1 text-xs break-words text-fg-muted select-text">{toast.detail}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={t("common.dismiss")}
            onClick={() => dismiss(toast.id)}
            className="h-6 w-6 shrink-0 rounded text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X size={14} className="mx-auto" aria-hidden />
          </button>
        </Notice>
      ))}
    </div>
  );
}

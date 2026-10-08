import type { ReactNode } from "react";

type PanelHeaderProps = {
  title: string;
  children?: ReactNode;
};

export function PanelHeader({ title, children }: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-3">
      <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

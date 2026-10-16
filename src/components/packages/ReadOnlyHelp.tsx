import { Copy, RefreshCw, Terminal } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { copyText } from "../../lib/clipboard";
import { notifyError, notifyInfo } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import type { BackendKind, PackageHit } from "../../store/types";

/**
 * What to do with a package when the active TeX can't be modified from LibreTeX (5.6,
 * backend 3): the pacman command to run by hand (LibreTeX never runs sudo) and a way to
 * read the status again afterwards.
 */
export function ReadOnlyHelp({ pkg, kind }: { pkg: PackageHit; kind: BackendKind | null }) {
  const t = useT();
  if (!pkg.inTexlive) {
    return <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.notInTexlive")}</p>;
  }
  if (kind === "pacman") {
    if (pkg.status === "installed") {
      return <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.pacmanUpdates")}</p>;
    }
    if (pkg.status === "missing") {
      return pkg.pacmanPackage ? (
        <PacmanCommand pkg={pkg.name} pacmanPackage={pkg.pacmanPackage} />
      ) : (
        <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.noPacman")}</p>
      );
    }
  }
  if (kind === "readOnly" && pkg.status !== "installed") {
    return <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.other")}</p>;
  }
  return null;
}

/** `sudo pacman -S <package>` to copy, and «Volver a comprobar» once the user ran it. */
export function PacmanCommand({ pkg, pacmanPackage }: { pkg: string; pacmanPackage: string }) {
  const t = useT();
  const [rechecking, setRechecking] = useState(false);
  const command = `sudo pacman -S ${pacmanPackage}`;

  const copy = () =>
    copyText(command)
      .then(() => notifyInfo(t("packages.card.copied", { text: command })))
      .catch(notifyError);

  const recheck = async () => {
    setRechecking(true);
    try {
      await usePackages.getState().recheckStatus();
    } catch (error) {
      notifyError(error);
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="mt-3 text-xs">
      <p className="text-fg-muted">{t("packages.readOnly.pacmanIntro", { name: pkg })}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded bg-topbar py-1.5 pr-1.5 pl-2.5">
        <code
          className="min-w-0 flex-1 basis-40 font-mono break-words"
          aria-label={t("packages.readOnly.command")}
        >
          <Terminal size={12} className="mr-1.5 inline text-fg-muted" aria-hidden />
          {command}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 hover:bg-hover"
        >
          <Copy size={12} aria-hidden />
          {t("packages.readOnly.copyCommand")}
        </button>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-fg-muted">
        <span>{t("packages.readOnly.noSudo")}</span>
        <button
          type="button"
          disabled={rechecking}
          onClick={() => void recheck()}
          className="flex items-center gap-1 rounded px-1 text-fg underline-offset-2 hover:underline disabled:opacity-50"
        >
          <RefreshCw size={12} className={rechecking ? "animate-spin" : ""} aria-hidden />
          {t("packages.readOnly.recheck")}
        </button>
      </p>
    </div>
  );
}

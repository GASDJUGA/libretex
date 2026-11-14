import { Copy, RefreshCw, Terminal } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { copyText } from "../../lib/clipboard";
import { notifyError, notifyInfo } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import { installCommand } from "../../lib/packages/installCommand";
import type { BackendKind, PackageHit } from "../../store/types";

/**
 * What to do with a package when the active TeX can't be modified from JuTeX (5.6): the
 * command to run by hand (pacman's TeX Live, or `sudo tlmgr` for an official TeX Live that
 * only root can change, like MacTeX; JuTeX never runs sudo) and a way to read the status
 * again afterwards.
 */
export function ReadOnlyHelp({
  pkg,
  kind,
  tlmgr,
}: {
  pkg: PackageHit;
  kind: BackendKind | null;
  tlmgr: string | null;
}) {
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
        <InstallCommand pkg={pkg.name} kind={kind} pacmanPackage={pkg.pacmanPackage} />
      ) : (
        <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.noPacman")}</p>
      );
    }
  }
  if (kind === "officialReadOnly" && tlmgr) {
    if (pkg.status === "installed") {
      return <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.tlmgrUpdates")}</p>;
    }
    if (pkg.status === "missing")
      return <InstallCommand pkg={pkg.name} kind={kind} tlmgr={tlmgr} />;
  }
  if (kind === "readOnly" && pkg.status !== "installed") {
    return <p className="mt-2 text-xs text-fg-muted">{t("packages.readOnly.other")}</p>;
  }
  return null;
}

/** The install command to copy, and «Volver a comprobar» once the user ran it. */
export function InstallCommand({
  pkg,
  kind,
  pacmanPackage,
  tlmgr,
}: {
  pkg: string;
  kind: BackendKind | null;
  pacmanPackage?: string | null;
  tlmgr?: string | null;
}) {
  const t = useT();
  const [rechecking, setRechecking] = useState(false);
  const command = installCommand(pkg, kind, { pacmanPackage, tlmgr });
  if (!command) return null;
  const intro =
    kind === "pacman" ? "packages.readOnly.pacmanIntro" : "packages.readOnly.tlmgrIntro";

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
      <p className="text-fg-muted">{t(intro, { name: pkg })}</p>
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

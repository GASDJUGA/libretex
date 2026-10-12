import { useEffect, useId, useState } from "react";
import { useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import type { PackageBackend } from "../../store/types";
import { useBackendName } from "./useBackendName";

/**
 * Which TeX LibreTeX uses, to compile and to manage packages: its own TeX Live or the
 * system's (pacman, or the official one). Shown only when both are installed.
 */
export function DistributionPicker() {
  const t = useT();
  const name = useBackendName();
  const id = useId();
  const backends = usePackages((s) => s.backends);
  const busy = usePackages((s) => s.operation.running || s.install.running);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!usePackages.getState().backends) usePackages.getState().loadBackends().catch(notifyError);
  }, []);

  if (!backends) return null;
  const managed = backends.available.find((b) => b.kind === "managed");
  const system = backends.available.find((b) => b.kind !== "managed");
  if (!managed || !system) return null;
  const current = backends.active?.kind === "managed" ? "libretex" : "system";

  const choose = async (choice: "libretex" | "system") => {
    if (choice === current) return;
    setSwitching(true);
    try {
      await usePackages.getState().setDistribution(choice);
    } catch (error) {
      notifyError(error);
    } finally {
      setSwitching(false);
    }
  };

  const option = (value: "libretex" | "system", backend: PackageBackend, help: string) => (
    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-hover has-disabled:cursor-default">
      <input
        type="radio"
        name={id}
        value={value}
        checked={current === value}
        disabled={busy || switching}
        onChange={() => void choose(value)}
        className="mt-1 accent-accent"
      />
      <span>
        <span className="block">{name(backend)}</span>
        <span className="block text-xs text-fg-muted">{help}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="mt-3 border-t border-line pt-2">
      <legend className="pt-2 text-xs font-semibold text-fg-muted">
        {t("packages.distribution.title")}
      </legend>
      {option("libretex", managed, t("packages.distribution.libretex"))}
      {option(
        "system",
        system,
        t(
          system.kind === "pacman"
            ? "packages.distribution.pacman"
            : "packages.distribution.system",
        ),
      )}
    </fieldset>
  );
}

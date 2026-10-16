import type { TexliveInstall } from "../../store/packages";

/** «5.3 MB» (with a non-breaking space). */
export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)}\u00a0MB`;

/**
 * Overall fraction of the installation (0–1): the download and preparation are short, the
 * basic scheme is most of it, the template's packages the end.
 */
export function installFraction(progress: TexliveInstall["progress"]): number {
  if (!progress) return 0;
  switch (progress.step) {
    case "download":
      return progress.total ? 0.08 * (progress.done / progress.total) : 0.04;
    case "extract":
      return 0.1;
    case "install":
      return 0.1 + 0.75 * (progress.done / Math.max(progress.total, 1));
    case "packages":
      return 0.85 + 0.15 * (progress.done / Math.max(progress.total, 1));
  }
}

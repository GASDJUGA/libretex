import { useT } from "../../i18n";
import type { PackageBackend } from "../../store/types";

/** Name of a backend, e.g. «TeX Live de JuTeX 2026». */
export function useBackendName() {
  const t = useT();
  return (backend: PackageBackend | null) =>
    backend
      ? t(`packages.backend.${backend.kind}`, { year: backend.year ?? "" }).trim()
      : t("packages.backend.none");
}

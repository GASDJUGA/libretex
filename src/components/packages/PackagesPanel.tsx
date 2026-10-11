import { useT } from "../../i18n";
import { PanelHeader } from "../common/PanelHeader";
import { BackendInfo } from "./BackendInfo";

/** Packages side panel of the project view (search and actions arrive in the next items). */
export function PackagesPanel() {
  const t = useT();
  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("rail.packages")}>
      <PanelHeader title={t("rail.packages")} />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <BackendInfo compact />
      </div>
    </section>
  );
}

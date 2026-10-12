import { useT } from "../../i18n";
import { PanelHeader } from "../common/PanelHeader";
import { BackendInfo } from "./BackendInfo";
import { PackageBrowser } from "./PackageBrowser";

/** Packages side panel of the project view: active backend and package search. */
export function PackagesPanel() {
  const t = useT();
  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("rail.packages")}>
      <PanelHeader title={t("rail.packages")} />
      <div className="px-3 pt-3">
        <BackendInfo compact />
      </div>
      <PackageBrowser compact inProject />
    </section>
  );
}

import { useT } from "../../i18n";
import { BackendInfo } from "../packages/BackendInfo";
import { PackageBrowser } from "../packages/PackageBrowser";

/** Packages tab of the home screen: active backend and package search (5.6). */
export function PackagesTab() {
  const t = useT();
  return (
    <section aria-labelledby="packages-title" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-8 py-5">
        <h1 id="packages-title" className="mr-auto text-xl font-semibold">
          {t("packages.title")}
        </h1>
      </header>
      <div className="px-8 pt-4">
        <BackendInfo />
      </div>
      <PackageBrowser />
    </section>
  );
}

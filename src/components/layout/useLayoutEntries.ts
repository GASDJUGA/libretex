import { useT } from "../../i18n";
import { useProjectView, type LayoutMode } from "../../store/project";
import type { MenuEntry } from "../common/Menu";

/** The layout choices (editor + PDF, only editor, only PDF…), for the rail and the View menu. */
export function useLayoutEntries(): MenuEntry[] {
  const t = useT();
  const layoutMode = useProjectView((s) => s.layoutMode);
  const setLayoutMode = useProjectView((s) => s.setLayoutMode);
  const entries = (
    [
      ["split", t("layout.split")],
      ["editor", t("layout.editor")],
      ["pdf", t("layout.pdf")],
    ] as [LayoutMode, string][]
  ).map(([mode, label]): MenuEntry => ({
    label,
    checked: layoutMode === mode,
    radio: true,
    onSelect: () => setLayoutMode(mode),
  }));
  entries.push({ label: t("layout.detached"), disabled: true, hint: t("common.comingSoon") });
  return entries;
}

import { Fragment } from "react";
import { useT, type TranslationKey } from "../../i18n";
import { IS_MAC, keyLabel } from "../../lib/platform";
import { SHORTCUTS } from "../../lib/shortcutList";
import { useHelp } from "../../store/help";
import { Dialog } from "../common/Dialog";
import { Logo } from "../common/Logo";

/** «Atajos de teclado» and «Acerca de JuTeX», shown from anywhere. */
export function HelpDialogs() {
  const dialog = useHelp((s) => s.dialog);
  if (dialog === "shortcuts") return <ShortcutsDialog />;
  if (dialog === "about") return <AboutDialog />;
  return null;
}

function ShortcutsDialog() {
  const t = useT();
  const close = useHelp((s) => s.close);
  /** `Mod+{space}` → `Ctrl+Espacio` (`⌘ Espacio` on macOS). */
  const keyText = (keys: string) =>
    keyLabel(keys).replace(/\{(\w+)\}/g, (_, name: string) =>
      t(`shortcuts.keys.${name}` as TranslationKey),
    );
  return (
    <Dialog
      title={t("shortcuts.title")}
      submitLabel={t("common.done")}
      onSubmit={close}
      onClose={close}
      hideCancel
      wide
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-auto pr-1">
        {SHORTCUTS.map(({ group, items }) => (
          <div key={group}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t(group)}
            </h3>
            <dl className="grid grid-cols-[minmax(0,13rem)_1fr] gap-x-4 gap-y-1">
              {items.map(({ keys, mac, action }) => (
                <Fragment key={action}>
                  <dt className="flex flex-wrap gap-1">
                    {(IS_MAC ? (mac ?? keys) : keys).map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="text-fg-muted">/</span>}
                        <kbd className="rounded border border-line bg-topbar px-1.5 font-sans text-xs whitespace-nowrap">
                          {keyText(k)}
                        </kbd>
                      </Fragment>
                    ))}
                  </dt>
                  <dd>{t(action)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function AboutDialog() {
  const t = useT();
  const close = useHelp((s) => s.close);
  return (
    <Dialog
      title={t("about.title")}
      submitLabel={t("common.done")}
      onSubmit={close}
      onClose={close}
      hideCancel
    >
      <div className="flex items-center gap-3">
        <Logo size={40} />
        <div>
          <p className="text-base font-semibold">JuTeX</p>
          <p className="text-fg-muted">{t("about.version", { version: __APP_VERSION__ })}</p>
        </div>
      </div>
      <p>{t("about.description")}</p>
      <p className="text-fg-muted">{t("about.local")}</p>
      <p className="text-fg-muted">{t("about.license")}</p>
    </Dialog>
  );
}

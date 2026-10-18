import { useState } from "react";
import { useT } from "../../i18n";
import { errorText, notifyInfo } from "../../lib/errors";
import { useHistory } from "../../store/history";
import { Dialog } from "../common/Dialog";

/** «Guardar versión»: a named version of the project in its history (5.7). */
export function SaveVersionDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const save = () => {
    setPending(true);
    useHistory
      .getState()
      .saveVersion(name.trim())
      .then(() => {
        notifyInfo(t("history.saved", { name: name.trim() }));
        onClose();
      })
      .catch((e: unknown) => {
        setError(errorText(e).text);
        setPending(false);
      });
  };

  return (
    <Dialog
      title={t("history.saveTitle")}
      submitLabel={t("history.save")}
      submitDisabled={pending || name.trim() === ""}
      error={error}
      onClose={onClose}
      onSubmit={save}
    >
      <label className="flex flex-col gap-1">
        {t("history.name")}
        <input
          type="text"
          value={name}
          maxLength={100}
          placeholder={t("history.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded border border-line bg-panel px-2 text-sm text-fg"
        />
      </label>
      <p className="mt-2 text-xs text-fg-muted">{t("history.saveHint")}</p>
    </Dialog>
  );
}

import { useState } from "react";
import { useT } from "../../i18n";
import { errorText, notifyInfo } from "../../lib/errors";
import { repoNameFor, validRemoteUrl, validRepoName } from "../../lib/remote";
import { useBackup } from "../../store/backup";
import { Dialog } from "../common/Dialog";

const inputClass = "h-9 rounded border border-line bg-panel px-2 text-sm text-fg";

/**
 * «Conectar con GitHub» (5.9): a new private repository created with `gh`, or the URL of an
 * existing one. Nothing is pushed until the user presses «Subir».
 */
export function ConnectDialog({
  projectName,
  hasGh,
  onClose,
}: {
  projectName: string;
  hasGh: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"create" | "url">(hasGh ? "create" : "url");
  const [name, setName] = useState(() => repoNameFor(projectName));
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const valid = mode === "create" ? hasGh && validRepoName(name) : validRemoteUrl(url);

  const submit = () => {
    setPending(true);
    setError(undefined);
    useBackup
      .getState()
      .connect(mode === "create" ? { create: name.trim() } : { url: url.trim() })
      .then(() => {
        notifyInfo(t("backup.connected"));
        onClose();
      })
      .catch((e: unknown) => {
        const { text, detail } = errorText(e);
        setError(detail ? `${text} (${detail})` : text);
        setPending(false);
      });
  };

  return (
    <Dialog
      title={t("backup.connectTitle")}
      submitLabel={mode === "create" ? t("backup.createRepo") : t("backup.connect")}
      submitDisabled={pending || !valid}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="connect-mode"
            checked={mode === "create"}
            disabled={!hasGh}
            onChange={() => setMode("create")}
            className="mt-1 accent-accent"
          />
          <span className="flex flex-col gap-1">
            {t("backup.modeCreate")}
            <span className="text-xs text-fg-muted">
              {hasGh ? t("backup.modeCreateHint") : t("backup.noGh")}
            </span>
          </span>
        </label>
        {mode === "create" && (
          <label className="ml-6 flex flex-col gap-1">
            {t("backup.repoName")}
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            {!validRepoName(name) && (
              <span className="text-xs text-danger">{t("backup.repoNameInvalid")}</span>
            )}
          </label>
        )}
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="connect-mode"
            checked={mode === "url"}
            onChange={() => setMode("url")}
            className="mt-1 accent-accent"
          />
          <span className="flex flex-col gap-1">
            {t("backup.modeUrl")}
            <span className="text-xs text-fg-muted">{t("backup.modeUrlHint")}</span>
          </span>
        </label>
        {mode === "url" && (
          <label className="ml-6 flex flex-col gap-1">
            {t("backup.url")}
            <input
              type="text"
              value={url}
              maxLength={500}
              placeholder="https://github.com/usuario/repositorio.git"
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <p className="text-xs text-fg-muted">{t("backup.connectSafe")}</p>
      </div>
    </Dialog>
  );
}

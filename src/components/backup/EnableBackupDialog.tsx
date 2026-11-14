import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { errorText, notifyInfo } from "../../lib/errors";
import { cleanIdentity } from "../../lib/settings";
import { getBackend } from "../../lib/tauri";
import { useBackup } from "../../store/backup";
import type { BackupStatus } from "../../store/types";
import { Dialog } from "../common/Dialog";

const inputClass = "h-9 rounded border border-line bg-panel px-2 text-sm text-fg";

/**
 * «Activar el respaldo con Git» (5.9): what will happen, and the author if `git config` has
 * none (asked once; the GitHub noreply address is suggested so the personal one stays private).
 */
export function EnableBackupDialog({
  status,
  onClose,
}: {
  status: BackupStatus;
  onClose: () => void;
}) {
  const t = useT();
  const askAuthor = !status.identity;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const author = askAuthor ? cleanIdentity({ name, email }) : null;

  const fromGithub = () => {
    setAsking(true);
    setError(undefined);
    getBackend()
      .githubIdentity()
      .then((identity) => {
        setName(identity.name);
        setEmail(identity.email);
      })
      .catch((e: unknown) => setError(errorText(e).text))
      .finally(() => setAsking(false));
  };

  const submit = () => {
    if (askAuthor && !author) {
      setError(t("backup.invalidAuthor"));
      return;
    }
    setPending(true);
    useBackup
      .getState()
      .enable(author ?? undefined)
      .then(() => {
        notifyInfo(t("backup.enabled"));
        onClose();
      })
      .catch((e: unknown) => {
        setError(errorText(e).text);
        setPending(false);
      });
  };

  return (
    <Dialog
      title={t("backup.enableTitle")}
      submitLabel={t("backup.enableSubmit")}
      submitDisabled={pending || (askAuthor && !author)}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>{t("backup.enableInit")}</li>
        <li>{t("backup.enableIgnore")}</li>
        <li>{t("backup.enableLocal")}</li>
      </ul>
      {status.insideOtherRepo && (
        <p className="mt-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {t("backup.insideOtherRepo")}
        </p>
      )}
      <h3 className="mt-4 mb-1 text-sm font-medium">{t("backup.author")}</h3>
      {status.identity ? (
        <p className="text-sm text-fg-muted">
          {t(
            status.identitySource === "git" ? "backup.authorFromGit" : "backup.authorFromJutex",
            status.identity,
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-fg-muted">{t("backup.authorAsk")}</p>
          <label className="flex flex-col gap-1 text-sm">
            {t("backup.name")}
            <input
              type="text"
              value={name}
              maxLength={100}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("backup.email")}
            <input
              type="email"
              value={email}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <p className="text-xs text-fg-muted">{t("backup.emailHint")}</p>
          <div>
            <button
              type="button"
              onClick={fromGithub}
              disabled={asking}
              title={t("backup.useGithubHint")}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-hover disabled:opacity-50"
            >
              {asking && <Loader2 size={12} className="animate-spin" aria-hidden />}
              {t("backup.useGithub")}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

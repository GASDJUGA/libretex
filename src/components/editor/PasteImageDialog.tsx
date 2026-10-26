import { useState } from "react";
import { useT } from "../../i18n";
import { errorText } from "../../lib/errors";
import { imageName, suggestedImageName } from "../../lib/imageName";
import { usePasteImage } from "../../store/pasteImage";
import { useProjects } from "../../store/projects";
import { Dialog, inputClass } from "../common/Dialog";

/** «Pegar imagen»: the pasted image's name (Enter accepts the suggested one). */
export function PasteImageDialog() {
  const pending = usePasteImage((s) => s.pending);
  if (!pending) return null;
  // A new dialog (and suggested name) for each paste.
  return <NameDialog key={pending.seq} />;
}

function NameDialog() {
  const t = useT();
  const pending = usePasteImage((s) => s.pending)!;
  const folder = useProjects((s) => s.current?.figuresDir ?? "");
  const [text, setText] = useState(() => suggestedImageName(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const name = imageName(text);
  const file = `${folder ? `${folder}/` : ""}${name}.${pending.image.extension}`;

  const save = () => {
    setBusy(true);
    setError(undefined);
    usePasteImage
      .getState()
      .save(name)
      .catch((e: unknown) => {
        setError(errorText(e).text);
        setBusy(false);
      });
  };

  return (
    <Dialog
      title={t("pasteImage.title")}
      submitLabel={t("pasteImage.insert")}
      submitDisabled={busy || name === ""}
      error={error}
      onClose={() => usePasteImage.getState().cancel()}
      onSubmit={save}
    >
      <label className="flex flex-col gap-1">
        {t("pasteImage.name")}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          className={inputClass}
        />
      </label>
      <p className="text-xs break-all text-fg-muted">
        {name ? t("pasteImage.savedAs", { file }) : t("pasteImage.emptyName")}
      </p>
    </Dialog>
  );
}

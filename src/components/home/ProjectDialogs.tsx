import { useState } from "react";
import { useI18n, useT } from "../../i18n";
import { errorText } from "../../lib/errors";
import { useProjects } from "../../store/projects";
import type { OpenFolderResult, ProjectSummary } from "../../store/types";
import { Dialog, inputClass } from "../common/Dialog";

/** Runs an async action, exposing `pending` and a translated `error` for the dialog. */
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = async <T,>(action: () => Promise<T>, onDone: (value: T) => void) => {
    setPending(true);
    setError(undefined);
    try {
      onDone(await action());
    } catch (e) {
      setError(errorText(e).text);
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

export function NewProjectDialog({
  initialTemplate,
  onClose,
  onCreated,
}: {
  initialTemplate: string | null;
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
}) {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const { templates, create } = useProjects();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(initialTemplate ?? "");
  const { pending, error, run } = useAction();

  return (
    <Dialog
      title={t("projects.newDialog.title")}
      submitLabel={t("projects.newDialog.create")}
      submitDisabled={pending || name.trim() === ""}
      error={error}
      onClose={onClose}
      onSubmit={() => run(() => create(name.trim(), template || null), onCreated)}
    >
      <label className="flex flex-col gap-1">
        {t("projects.newDialog.name")}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("projects.newDialog.namePlaceholder")}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        {t("projects.newDialog.template")}
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className={inputClass}
        >
          <option value="">{t("projects.newDialog.blank")}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name[locale]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-fg-muted">
        {template
          ? templates.find((tpl) => tpl.id === template)?.description[locale]
          : "main.tex · XeLaTeX"}
      </p>
    </Dialog>
  );
}

export function RenameDialog({
  project,
  onClose,
}: {
  project: ProjectSummary;
  onClose: () => void;
}) {
  const t = useT();
  const rename = useProjects((s) => s.rename);
  const [name, setName] = useState(project.name);
  const { pending, error, run } = useAction();

  return (
    <Dialog
      title={t("projects.renameDialog.title")}
      submitLabel={t("projects.renameDialog.submit")}
      submitDisabled={pending || name.trim() === "" || name.trim() === project.name}
      error={error}
      onClose={onClose}
      onSubmit={() => run(() => rename(project.id, name.trim()), onClose)}
    >
      <label className="flex flex-col gap-1">
        {t("projects.renameDialog.name")}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <p className="text-xs text-fg-muted">{t("projects.renameDialog.hint")}</p>
    </Dialog>
  );
}

export function TrashDialog({
  project,
  onClose,
  onTrashed,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onTrashed: () => void;
}) {
  const t = useT();
  const trash = useProjects((s) => s.trash);
  const { pending, error, run } = useAction();

  return (
    <Dialog
      title={t("projects.trashDialog.title")}
      submitLabel={t("projects.trashDialog.submit")}
      submitDisabled={pending}
      danger
      error={error}
      onClose={onClose}
      onSubmit={() => run(() => trash(project.id), onTrashed)}
    >
      <p>{t("projects.trashDialog.text", { name: project.name })}</p>
      <p className="text-xs break-all text-fg-muted">{project.displayPath}</p>
    </Dialog>
  );
}

export function MainFileDialog({
  result,
  onClose,
  onChosen,
}: {
  result: OpenFolderResult;
  onClose: () => void;
  onChosen: (project: ProjectSummary) => void;
}) {
  const t = useT();
  const setMainFile = useProjects((s) => s.setMainFile);
  const [choice, setChoice] = useState(result.project.mainFile);
  const { pending, error, run } = useAction();

  return (
    <Dialog
      title={t("projects.mainDialog.title")}
      submitLabel={t("projects.mainDialog.submit")}
      submitDisabled={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => run(() => setMainFile(result.project.id, choice), onChosen)}
    >
      <p>{t("projects.mainDialog.text")}</p>
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">{t("projects.mainDialog.title")}</legend>
        {result.candidates.map((file) => (
          <label
            key={file}
            className="flex items-center gap-2 rounded px-2 py-1.5 font-mono text-xs hover:bg-hover"
          >
            <input
              type="radio"
              name="main-file"
              value={file}
              checked={choice === file}
              onChange={() => setChoice(file)}
              className="accent-accent"
            />
            {file}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

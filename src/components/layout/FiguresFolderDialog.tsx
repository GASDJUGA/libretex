import { useState } from "react";
import { useT } from "../../i18n";
import { errorText } from "../../lib/errors";
import { useProjectFiles } from "../../store/files";
import { useProjects } from "../../store/projects";
import type { FileNode, ProjectSummary } from "../../store/types";
import { Dialog } from "../common/Dialog";

/** Every folder of the tree, in tree order (paths relative to the root). */
function folders(nodes: FileNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "folder" ? [node.path, ...folders(node.children ?? [])] : [],
  );
}

/** Where pasted images are saved in this project (`figuresDir`; the root by default). */
export function FiguresFolderDialog({
  project,
  onClose,
}: {
  project: ProjectSummary;
  onClose: () => void;
}) {
  const t = useT();
  const tree = useProjectFiles((s) => s.tree);
  const [choice, setChoice] = useState(project.figuresDir);
  const [error, setError] = useState<string>();
  const options = ["", ...folders(tree)];

  const save = () => {
    useProjects
      .getState()
      .updateMeta(project.id, { figuresDir: choice })
      .then(onClose)
      .catch((e: unknown) => setError(errorText(e).text));
  };

  return (
    <Dialog
      title={t("figuresFolder.title")}
      submitLabel={t("figuresFolder.save")}
      error={error}
      wide
      onClose={onClose}
      onSubmit={save}
    >
      <p className="text-sm text-fg-muted">{t("figuresFolder.hint")}</p>
      <div role="radiogroup" className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
        {options.map((folder) => (
          <label
            key={folder}
            className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-hover"
          >
            <input
              type="radio"
              name="figures-folder"
              checked={choice === folder}
              onChange={() => setChoice(folder)}
              className="accent-accent"
            />
            {folder === "" ? t("figuresFolder.root") : <span className="font-mono">{folder}/</span>}
          </label>
        ))}
      </div>
      {options.length === 1 && <p className="text-xs text-fg-muted">{t("figuresFolder.none")}</p>}
    </Dialog>
  );
}

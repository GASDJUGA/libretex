import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Star,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useT } from "../../i18n";
import { errorText, notifyError, notifyInfo } from "../../lib/errors";
import { basename, isWithin, parentOf, remap } from "../../lib/paths";
import { getBackend } from "../../lib/tauri";
import { useProjectFiles } from "../../store/files";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import type { FileNode } from "../../store/types";
import { Dialog, inputClass } from "../common/Dialog";
import { Collapsible } from "../common/Collapsible";
import { ContextMenu, type MenuEntry } from "../common/Menu";
import { IconButton, PanelHeader } from "../common/PanelHeader";
import { useShallow } from "zustand/react/shallow";

type FileTreeProps = {
  nodes: FileNode[];
  mainFile: string;
};

/** MIME type used to drag entries inside the tree. */
const DRAG_TYPE = "application/x-libretex-path";

function fileIcon(name: string) {
  if (name.endsWith(".tex")) return FileText;
  if (name.endsWith(".bib")) return BookOpen;
  if (/\.(png|jpe?g|gif|svg|webp|pdf)$/i.test(name)) return Image;
  return File;
}

type DialogState =
  | { kind: "newFile" | "newFolder"; folder: string }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | null;

type MenuState = { x: number; y: number; node: FileNode | null } | null;

export function FileTree({ nodes, mainFile }: FileTreeProps) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  /** Folder highlighted as drop target (`""` = root), while dragging. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const { activeFile, openFile } = useProjectView(
    useShallow(({ activeFile, openFile }) => ({ activeFile, openFile })),
  );
  const files = useProjectFiles();
  const { current, setMainFile } = useProjects();

  const folderLabel = (folder: string) => (folder ? folder : t("fileTree.root"));
  const attempt = (action: () => Promise<unknown>) => {
    action().catch(notifyError);
  };
  const expand = (folder: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let f = folder; f; f = parentOf(f)) next.add(f);
      return next;
    });
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  /** Folder for new files: the selected folder, or the folder of the selected file. */
  const targetFolder = () => {
    if (selected === null) return "";
    const node = findNode(nodes, selected);
    return node?.kind === "folder" ? node.path : parentOf(selected);
  };

  /** Keeps the main file in project.json in sync when it is renamed or moved. */
  const followMainFile = async (from: string, to: string) => {
    if (current && isWithin(mainFile, from)) {
      await setMainFile(current.id, remap(mainFile, from, to));
    }
  };

  const move = async (path: string, destFolder: string) => {
    if (parentOf(path) === destFolder || isWithin(destFolder, path)) return;
    const to = await files.move(path, destFolder);
    await followMainFile(path, to);
    expand(destFolder);
    setSelected(to);
  };

  const upload = async (folder: string) => {
    const added = await files.upload(folder, t("fileTree.uploadTitle"));
    if (added.length) {
      expand(folder);
      notifyInfo(t("fileTree.added", { count: added.length }));
    }
  };

  // «Archivo» menu: new file / folder / upload in the selected folder.
  const onTreeRequest = useRef<(kind: "newFile" | "newFolder" | "upload") => void>(() => {});
  useEffect(() => {
    onTreeRequest.current = (kind) => {
      const folder = targetFolder();
      if (kind === "upload") attempt(() => upload(folder));
      else setDialog({ kind, folder });
    };
  });
  useEffect(
    () =>
      useProjectView.subscribe((state, prev) => {
        if (state.treeRequest && state.treeRequest !== prev.treeRequest) {
          onTreeRequest.current(state.treeRequest.kind);
        }
      }),
    [],
  );

  // Files dragged from the system: highlight the folder under the pointer, import on drop.
  useEffect(() => {
    const folderAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-folder]");
      return el?.dataset.dropFolder ?? "";
    };
    return getBackend().onFilesDropped((event) => {
      if (event.type === "leave") {
        setDropTarget(null);
      } else if (event.type === "over") {
        setDropTarget(folderAt(event.x, event.y));
      } else {
        const folder = folderAt(event.x, event.y);
        setDropTarget(null);
        useProjectFiles
          .getState()
          .importDropped(folder, event.paths)
          .then((added) => {
            if (!added.length) return;
            expand(folder);
            notifyInfo(t("fileTree.added", { count: added.length }));
          })
          .catch(notifyError);
      }
    });
  }, [t]);

  const entriesFor = (node: FileNode | null): MenuEntry[] => {
    const folder = node === null ? "" : node.kind === "folder" ? node.path : parentOf(node.path);
    const create: MenuEntry[] = [
      { label: t("fileTree.newFileHere"), onSelect: () => setDialog({ kind: "newFile", folder }) },
      {
        label: t("fileTree.newFolderHere"),
        onSelect: () => setDialog({ kind: "newFolder", folder }),
      },
      { label: t("fileTree.uploadHere"), onSelect: () => attempt(() => upload(folder)) },
    ];
    if (node === null) return create;
    const entries: MenuEntry[] = [];
    if (node.kind === "file") {
      entries.push({ label: t("fileTree.open"), onSelect: () => openFile(node.path) });
      if (node.name.endsWith(".tex") && node.path !== mainFile && current) {
        entries.push({
          label: t("fileTree.setMain"),
          onSelect: () =>
            attempt(async () => {
              await setMainFile(current.id, node.path);
              notifyInfo(t("fileTree.mainChanged", { name: node.name }));
            }),
        });
      }
      entries.push({ kind: "separator" });
    }
    return [
      ...entries,
      ...create,
      { kind: "separator" },
      {
        label: t("fileTree.rename"),
        shortcut: "F2",
        onSelect: () => setDialog({ kind: "rename", path: node.path }),
      },
      { label: t("fileTree.duplicate"), onSelect: () => attempt(() => files.duplicate(node.path)) },
      { kind: "separator" },
      {
        label: t("fileTree.delete"),
        shortcut: "Supr",
        danger: true,
        onSelect: () => setDialog({ kind: "delete", path: node.path }),
      },
    ];
  };

  const openMenu = (e: MouseEvent, node: FileNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (node) setSelected(node.path);
    setMenu({ x: e.clientX, y: e.clientY, node });
  };

  const onRowKeyDown = (e: KeyboardEvent, node: FileNode) => {
    if (e.key === "F2") {
      e.preventDefault();
      setDialog({ kind: "rename", path: node.path });
    } else if (e.key === "Delete") {
      e.preventDefault();
      setDialog({ kind: "delete", path: node.path });
    }
  };

  // Internal drag & drop (move). Folders and the root accept drops.
  const dragProps = (node: FileNode) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, node.path);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setDropTarget(null),
  });
  const dropProps = (folder: string) => ({
    "data-drop-folder": folder,
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(folder);
    },
    onDrop: (e: DragEvent) => {
      const path = e.dataTransfer.getData(DRAG_TYPE);
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      attempt(() => move(path, folder));
    },
  });

  const renderNodes = (list: FileNode[], depth: number) =>
    list.map((node) => {
      const indent = { paddingLeft: `${depth * 14 + 8}px` };
      const isSelected = node.path === selected;
      if (node.kind === "folder") {
        const open = expanded.has(node.path);
        const isDropTarget = dropTarget === node.path;
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-expanded={open}
            aria-selected={isSelected}
            {...dropProps(node.path)}
          >
            <button
              type="button"
              style={indent}
              {...dragProps(node)}
              onClick={() => {
                toggle(node.path);
                setSelected(node.path);
              }}
              onContextMenu={(e) => openMenu(e, node)}
              onKeyDown={(e) => onRowKeyDown(e, node)}
              className={`flex h-7 w-full items-center gap-1.5 pr-2 text-left text-sm ${
                isDropTarget
                  ? "bg-accent/40 outline outline-1 outline-accent"
                  : isSelected
                    ? "bg-hover"
                    : "hover:bg-hover"
              }`}
            >
              {open ? (
                <ChevronDown size={14} aria-hidden />
              ) : (
                <ChevronRight size={14} aria-hidden />
              )}
              {open ? (
                <FolderOpen size={15} className="text-warning" aria-hidden />
              ) : (
                <Folder size={15} className="text-warning" aria-hidden />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            <Collapsible open={open}>
              {() => <ul role="group">{renderNodes(node.children, depth + 1)}</ul>}
            </Collapsible>
          </li>
        );
      }
      const Icon = fileIcon(node.name);
      const active = node.path === activeFile;
      return (
        <li key={node.path} role="treeitem" aria-selected={isSelected || active}>
          <button
            type="button"
            style={indent}
            {...dragProps(node)}
            onClick={() => {
              setSelected(node.path);
              openFile(node.path);
            }}
            onContextMenu={(e) => openMenu(e, node)}
            onKeyDown={(e) => onRowKeyDown(e, node)}
            className={`flex h-7 w-full items-center gap-1.5 pr-2 text-left text-sm ${
              active ? "bg-accent/25 text-fg" : isSelected ? "bg-hover" : "hover:bg-hover"
            }`}
          >
            <span className="w-3.5" />
            <Icon size={15} className="shrink-0 text-fg-muted" aria-hidden />
            <span className="truncate">{node.name}</span>
            {node.path === mainFile && (
              <Star
                size={12}
                className="ml-auto shrink-0 fill-accent-text text-accent-text"
                aria-label={t("fileTree.mainFile")}
              />
            )}
          </button>
        </li>
      );
    });

  const rootIsDropTarget = dropTarget === "";

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("fileTree.title")}>
      <PanelHeader title={t("fileTree.title")}>
        <IconButton
          label={t("fileTree.newFile")}
          onClick={() => setDialog({ kind: "newFile", folder: targetFolder() })}
        >
          <FilePlus size={15} aria-hidden />
        </IconButton>
        <IconButton
          label={t("fileTree.newFolder")}
          onClick={() => setDialog({ kind: "newFolder", folder: targetFolder() })}
        >
          <FolderPlus size={15} aria-hidden />
        </IconButton>
        <IconButton
          label={t("fileTree.upload")}
          onClick={() => attempt(() => upload(targetFolder()))}
        >
          <Upload size={15} aria-hidden />
        </IconButton>
        <IconButton label={t("fileTree.collapseAll")} onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp size={15} aria-hidden />
        </IconButton>
      </PanelHeader>
      <div
        ref={treeRef}
        {...dropProps("")}
        onContextMenu={(e) => openMenu(e, null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
        className={`relative min-h-0 flex-1 overflow-auto py-1 ${
          rootIsDropTarget ? "bg-accent/15 outline outline-1 -outline-offset-1 outline-accent" : ""
        }`}
      >
        {nodes.length === 0 ? (
          <p className="px-3 py-2 text-sm text-fg-muted">{t("fileTree.empty")}</p>
        ) : (
          <ul role="tree" aria-label={t("fileTree.tree")}>
            {renderNodes(nodes, 0)}
          </ul>
        )}
        {dropTarget !== null && (
          <p className="pointer-events-none sticky bottom-0 mt-2 bg-panel/90 px-3 py-1 text-xs text-fg">
            {t("fileTree.dropHint", { folder: folderLabel(dropTarget) })}
          </p>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.node ? t("fileTree.actions", { name: menu.node.name }) : t("fileTree.title")}
          entries={entriesFor(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}

      {(dialog?.kind === "newFile" || dialog?.kind === "newFolder") && (
        <NameDialog
          title={t(dialog.kind === "newFile" ? "fileTree.newFileTitle" : "fileTree.newFolderTitle")}
          hint={t("fileTree.inFolder", { folder: folderLabel(dialog.folder) })}
          initial={dialog.kind === "newFile" ? ".tex" : ""}
          submitLabel={t("fileTree.create")}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const path =
              dialog.kind === "newFile"
                ? await files.createFile(dialog.folder, name)
                : await files.createFolder(dialog.folder, name);
            expand(dialog.kind === "newFile" ? dialog.folder : path);
            setSelected(path);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title={t("fileTree.renameTitle", { name: basename(dialog.path) })}
          initial={basename(dialog.path)}
          submitLabel={t("fileTree.renameSubmit")}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const to = await files.rename(dialog.path, name);
            await followMainFile(dialog.path, to);
            setSelected(to);
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDelete
          path={dialog.path}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await files.remove(dialog.path);
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}

function findNode(nodes: FileNode[], path: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "folder" && isWithin(path, node.path)) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** Dialog asking for a name; errors from the backend are shown inside it. */
function NameDialog({
  title,
  hint,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  hint?: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the name without its extension, like file managers do.
  useEffect(() => {
    const dot = initial.lastIndexOf(".");
    inputRef.current?.setSelectionRange(0, dot > 0 ? dot : dot === 0 ? 0 : initial.length);
  }, [initial]);

  return (
    <Dialog
      title={title}
      submitLabel={submitLabel}
      submitDisabled={pending || name.trim() === "" || name === initial}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setPending(true);
        setError(undefined);
        try {
          await onSubmit(name.trim());
          onClose();
        } catch (e) {
          setError(errorText(e).text);
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        {t("fileTree.nameLabel")}
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </Dialog>
  );
}

function ConfirmDelete({
  path,
  onClose,
  onConfirm,
}: {
  path: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useT();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      title={t("fileTree.deleteTitle", { name: basename(path) })}
      submitLabel={t("fileTree.deleteSubmit")}
      submitDisabled={pending}
      danger
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        setPending(true);
        try {
          await onConfirm();
          onClose();
        } catch (e) {
          setError(errorText(e).text);
          setPending(false);
        }
      }}
    >
      <p>{t("fileTree.deleteText")}</p>
      <p className="font-mono text-xs break-all text-fg-muted">{path}</p>
    </Dialog>
  );
}

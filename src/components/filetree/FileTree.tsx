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
import { useState } from "react";
import type { FileNode } from "../../mocks/projectFiles";
import { useProjectView } from "../../store/project";
import { IconButton, PanelHeader } from "../common/PanelHeader";

type FileTreeProps = {
  nodes: FileNode[];
  mainFile: string;
};

function fileIcon(name: string) {
  if (name.endsWith(".tex")) return FileText;
  if (name.endsWith(".bib")) return BookOpen;
  if (/\.(png|jpe?g|pdf|svg)$/i.test(name)) return Image;
  return File;
}

export function FileTree({ nodes, mainFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["capitulos"]));
  const { activeFile, openFile } = useProjectView();

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (list: FileNode[], depth: number) =>
    list.map((node) => {
      const indent = { paddingLeft: `${depth * 14 + 8}px` };
      if (node.kind === "folder") {
        const open = expanded.has(node.path);
        return (
          <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={false}>
            <button
              type="button"
              style={indent}
              onClick={() => toggle(node.path)}
              className="flex h-7 w-full items-center gap-1.5 pr-2 text-left text-sm hover:bg-hover"
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
            {open && <ul role="group">{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }
      const Icon = fileIcon(node.name);
      const active = node.path === activeFile;
      return (
        <li key={node.path} role="treeitem" aria-selected={active}>
          <button
            type="button"
            style={indent}
            onClick={() => openFile(node.path)}
            className={`flex h-7 w-full items-center gap-1.5 pr-2 text-left text-sm ${
              active ? "bg-accent/25 text-fg" : "hover:bg-hover"
            }`}
          >
            <span className="w-3.5" />
            <Icon size={15} className="shrink-0 text-fg-muted" aria-hidden />
            <span className="truncate">{node.name}</span>
            {node.path === mainFile && (
              <Star
                size={12}
                className="ml-auto shrink-0 fill-accent text-accent"
                aria-label="Archivo principal"
              />
            )}
          </button>
        </li>
      );
    });

  return (
    <section className="flex h-full flex-col bg-panel" aria-label="Archivos">
      <PanelHeader title="Archivos">
        <IconButton label="Nuevo archivo">
          <FilePlus size={15} aria-hidden />
        </IconButton>
        <IconButton label="Nueva carpeta">
          <FolderPlus size={15} aria-hidden />
        </IconButton>
        <IconButton label="Subir archivos">
          <Upload size={15} aria-hidden />
        </IconButton>
        <IconButton label="Colapsar todo" onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp size={15} aria-hidden />
        </IconButton>
      </PanelHeader>
      <ul role="tree" aria-label="Archivos del proyecto" className="flex-1 overflow-auto py-1">
        {renderNodes(nodes, 0)}
      </ul>
    </section>
  );
}

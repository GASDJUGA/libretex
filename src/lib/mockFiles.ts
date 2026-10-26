import type { BackendError, FileNode, TextFile } from "../store/types";

const fail = (code: string, message: string): never => {
  throw { code, message } satisfies BackendError;
};

type Entry = { kind: "folder" } | { kind: "file"; content: string | null; modifiedAt: number };

const META_DIR = ".libretex";

function parts(path: string): string[] {
  if (path.startsWith("/") || path.startsWith("\\")) fail("invalidPath", path);
  const segments = path.split("/").filter((p) => p !== "" && p !== ".");
  if (segments.includes("..")) fail("invalidPath", path);
  return segments;
}

function validName(name: string) {
  if (!name || name !== name.trim() || /[/\\\0]/.test(name) || name === "." || name === "..") {
    fail("invalidName", `nombre no válido «${name}»`);
  }
}

function userPath(path: string): string {
  const segments = parts(path);
  if (segments.length === 0) fail("forbidden", "la raíz del proyecto");
  if (segments[0] === META_DIR) fail("forbidden", `${META_DIR}/`);
  return segments.join("/");
}

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const nameOf = (path: string) => path.split("/").pop() ?? path;
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/**
 * In-memory project file system with the same rules as src-tauri/src/files: relative paths
 * only, no `..`, the root and `.libretex/` are protected, nothing is overwritten.
 */
export class MockFiles {
  private entries = new Map<string, Entry>();

  constructor(files: Record<string, string | null>) {
    for (const [path, content] of Object.entries(files)) this.put(path, content);
  }

  private put(path: string, content: string | null) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      this.entries.set(segments.slice(0, i).join("/"), { kind: "folder" });
    }
    this.entries.set(path, { kind: "file", content, modifiedAt: Date.now() });
  }

  private exists(path: string) {
    return path === "" || this.entries.has(path);
  }

  private isFolder(path: string) {
    return path === "" || this.entries.get(path)?.kind === "folder";
  }

  /** `path` and everything below it. */
  private subtree(path: string): string[] {
    return [...this.entries.keys()].filter((p) => p === path || p.startsWith(`${path}/`));
  }

  private unique(dir: string, name: string, suffix?: string): string {
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 1; ; n++) {
      const label = suffix ? (n === 1 ? suffix : `${suffix} ${n}`) : n === 1 ? null : `${n}`;
      const candidate = join(dir, label === null ? name : `${stem} (${label})${ext}`);
      if (!this.exists(candidate)) return candidate;
    }
  }

  tree(): FileNode[] {
    const build = (dir: string): FileNode[] =>
      [...this.entries.entries()]
        .filter(([p]) => parentOf(p) === dir && !(dir === "" && p === META_DIR))
        .map(([path, entry]): FileNode =>
          entry.kind === "folder"
            ? { kind: "folder", name: nameOf(path), path, children: build(path) }
            : { kind: "file", name: nameOf(path), path },
        )
        .sort(
          (a, b) =>
            Number(a.kind === "file") - Number(b.kind === "file") ||
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
    return build("");
  }

  read(path: string): TextFile {
    const key = userPath(path);
    const entry = this.entries.get(key) ?? fail("notFound", `no existe: ${path}`);
    if (entry.kind !== "file" || entry.content === null) fail("notText", path);
    const file = entry as Extract<Entry, { kind: "file" }>;
    return { content: file.content ?? "", modifiedAt: file.modifiedAt };
  }

  write(path: string, content: string): number {
    const key = userPath(path);
    if (this.isFolder(key)) fail("alreadyExists", path);
    if (!this.exists(key)) key.split("/").forEach(validName);
    this.put(key, content);
    return (this.entries.get(key) as { modifiedAt: number }).modifiedAt;
  }

  createFile(path: string) {
    const key = userPath(path);
    key.split("/").forEach(validName);
    if (this.exists(key)) fail("alreadyExists", path);
    this.put(key, "");
  }

  /** A new binary file (an image), never over an existing one. */
  createBinary(path: string) {
    const key = userPath(path);
    key.split("/").forEach(validName);
    if (this.exists(key)) fail("alreadyExists", path);
    this.put(key, null);
  }

  /** Whether `path` is an existing folder (`""`: the root). */
  hasFolder(path: string) {
    return this.isFolder(path);
  }

  createFolder(path: string) {
    const key = userPath(path);
    key.split("/").forEach(validName);
    if (this.exists(key)) fail("alreadyExists", path);
    const segments = key.split("/");
    for (let i = 1; i <= segments.length; i++) {
      this.entries.set(segments.slice(0, i).join("/"), { kind: "folder" });
    }
  }

  private relocate(from: string, to: string) {
    for (const path of this.subtree(from)) {
      const entry = this.entries.get(path)!;
      this.entries.delete(path);
      this.entries.set(to + path.slice(from.length), entry);
    }
  }

  rename(path: string, newName: string): string {
    validName(newName);
    const key = userPath(path);
    if (!this.exists(key)) fail("notFound", path);
    const to = join(parentOf(key), newName);
    if (to === key) return to;
    if (this.exists(to)) fail("alreadyExists", to);
    this.relocate(key, to);
    return to;
  }

  move(path: string, destFolder: string): string {
    const key = userPath(path);
    if (!this.exists(key)) fail("notFound", path);
    const dest = parts(destFolder).join("/");
    if (dest.split("/")[0] === META_DIR) fail("forbidden", `${META_DIR}/`);
    if (!this.isFolder(dest)) fail("notFound", destFolder);
    if (dest === key || dest.startsWith(`${key}/`))
      fail("forbidden", "mover una carpeta dentro de sí misma");
    const to = join(dest, nameOf(key));
    if (to === key) return to;
    if (this.exists(to)) fail("alreadyExists", to);
    this.relocate(key, to);
    return to;
  }

  duplicate(path: string): string {
    const key = userPath(path);
    if (!this.exists(key)) fail("notFound", path);
    const to = this.unique(parentOf(key), nameOf(key), "copia");
    for (const p of this.subtree(key)) {
      this.entries.set(to + p.slice(key.length), { ...this.entries.get(p)! });
    }
    return to;
  }

  delete(path: string) {
    const key = userPath(path);
    if (!this.exists(key)) fail("notFound", path);
    for (const p of this.subtree(key)) this.entries.delete(p);
  }

  /** Text files with their content (for the mock index). */
  textFiles(): [string, string][] {
    return [...this.entries.entries()].flatMap(([path, entry]) =>
      entry.kind === "file" && entry.content !== null
        ? [[path, entry.content] as [string, string]]
        : [],
    );
  }

  /** Simulates copying files picked in the native dialog. */
  import(destFolder: string, names: string[]): string[] {
    const dest = parts(destFolder).join("/");
    if (!this.isFolder(dest)) fail("notFound", destFolder);
    return names.map((name) => {
      const to = this.unique(dest, name);
      this.put(to, name.endsWith(".tex") ? "" : null);
      return to;
    });
  }
}

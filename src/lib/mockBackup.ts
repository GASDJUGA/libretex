/**
 * The backup with Git (5.9) of the in-memory backend: the same rules as src-tauri/src/backup,
 * with commits as snapshots of the project's text files.
 */
import type {
  Backup,
  BackendError,
  BackupPending,
  BackupStatus,
  FileChange,
  Identity,
  Settings,
} from "../store/types";
import type { Backend } from "./tauri";
import type { MockFiles } from "./mockFiles";
import { cleanIdentity } from "./settings";

const fail = (code: string, message: string): never => {
  throw { code, message } satisfies BackendError;
};

type Commit = { backup: Backup; contents: Record<string, string> };

type Repo = {
  commits: Commit[];
  /** `git config` author (none by default, so LibreTeX's is asked for). */
  identity: Identity | null;
  pushAfterBackup: boolean;
};

const GITIGNORE =
  "# LibreTeX: datos del editor y archivos que genera LaTeX\n.libretex/\n*.aux\n*.log\n";

/** Lines changed between two snapshots, as `FileChange`s sorted by path. */
export function diffSnapshots(
  before: Record<string, string>,
  after: Record<string, string>,
): FileChange[] {
  return [...new Set([...Object.keys(after), ...Object.keys(before)])]
    .sort()
    .flatMap((path): FileChange[] =>
      !(path in before)
        ? [{ path, kind: "added" }]
        : !(path in after)
          ? [{ path, kind: "deleted" }]
          : after[path] !== before[path]
            ? [{ path, kind: "modified" }]
            : [],
    );
}

type BackupMethods = Pick<
  Backend,
  | "backupStatus"
  | "backupEnable"
  | "githubIdentity"
  | "backupPending"
  | "backupCreate"
  | "backupList"
  | "backupChanges"
  | "backupFile"
  | "backupRestoreFile"
  | "backupRestore"
>;

export function createMockBackup(
  files: (id: string) => MockFiles,
  settings: () => Settings,
  saveIdentity: (identity: Identity) => void,
): BackupMethods {
  const repos = new Map<string, Repo>();
  let counter = 0;

  const repo = (id: string) => {
    files(id);
    return repos.get(id) ?? fail("forbidden", "el respaldo con Git no está activado");
  };
  const snapshot = (id: string) => Object.fromEntries(files(id).textFiles());
  const head = (r: Repo) => r.commits[0]?.contents ?? {};
  const author = (r: Repo): Identity => {
    const saved = cleanIdentity({ name: settings().gitName, email: settings().gitEmail });
    return r.identity ?? saved ?? fail("needsIdentity", "falta el autor de los respaldos");
  };
  const ensureGitignore = (id: string) => {
    const fs = files(id);
    const current = snapshot(id)[".gitignore"];
    if (current === undefined) fs.write(".gitignore", GITIGNORE);
    else if (!current.includes(".libretex")) fs.write(".gitignore", `${current}\n${GITIGNORE}`);
  };
  const commit = (id: string, r: Repo, message: string): Backup | null => {
    const contents = snapshot(id);
    if (r.commits.length > 0 && diffSnapshots(head(r), contents).length === 0) return null;
    const who = author(r);
    const backup: Backup = {
      id: `b${++counter}`,
      message: message.split("\n")[0],
      author: who.name,
      time: Date.now(),
      pushed: null,
    };
    r.commits.unshift({ backup, contents });
    return backup;
  };
  const find = (r: Repo, version: string) =>
    r.commits.find((c) => c.backup.id === version) ?? fail("notFound", version);
  const status = (id: string): BackupStatus => {
    const r = repos.get(id);
    files(id);
    const saved = cleanIdentity({ name: settings().gitName, email: settings().gitEmail });
    return {
      enabled: !!r,
      insideOtherRepo: false,
      branch: r ? "main" : null,
      identity: r?.identity ?? saved,
      identitySource: r?.identity ? "git" : saved ? "libretex" : null,
      remote: null,
      tracking: false,
      ahead: r?.commits.length ?? 0,
      behind: 0,
      pending: r ? diffSnapshots(head(r), snapshot(id)).length : 0,
      pushAfterBackup: r?.pushAfterBackup ?? false,
    };
  };

  return {
    backupStatus: async (id) => status(id),
    backupEnable: async (id, identity) => {
      if (identity) {
        const clean = cleanIdentity(identity) ?? fail("invalidName", "el correo no es válido");
        saveIdentity(clean);
      }
      if (!repos.has(id)) repos.set(id, { commits: [], identity: null, pushAfterBackup: false });
      ensureGitignore(id);
      return status(id);
    },
    githubIdentity: async () => ({
      name: "Ana Pérez",
      email: "1234567+ana@users.noreply.github.com",
    }),
    backupPending: async (id): Promise<BackupPending> => ({
      changes: diffSnapshots(head(repo(id)), snapshot(id)),
      tooBig: [],
    }),
    backupCreate: async (id, message) => {
      const r = repo(id);
      const text = message.trim();
      if (!text || [...text].length > 1000) fail("invalidName", "mensaje del respaldo");
      ensureGitignore(id);
      return commit(id, r, text);
    },
    backupList: async (id) => repo(id).commits.map((c) => ({ ...c.backup })),
    backupChanges: async (id, version) => {
      const r = repo(id);
      const index = r.commits.findIndex((c) => c.backup.id === version);
      if (index < 0) fail("notFound", version);
      return diffSnapshots(r.commits[index + 1]?.contents ?? {}, r.commits[index].contents);
    },
    backupFile: async (id, version, path) => ({
      content: find(repo(id), version).contents[path] ?? null,
      binary: false,
    }),
    backupRestoreFile: async (id, version, path) => {
      const r = repo(id);
      const content = find(r, version).contents[path];
      commit(id, r, `Antes de restaurar «${path}»`);
      if (content === undefined) files(id).delete(path);
      else files(id).write(path, content);
    },
    backupRestore: async (id, version) => {
      const r = repo(id);
      const target = find(r, version).contents;
      commit(id, r, "Antes de restaurar el proyecto");
      const changed = diffSnapshots(snapshot(id), target).map((c) => c.path);
      for (const path of changed) {
        if (path in target) files(id).write(path, target[path]);
        else files(id).delete(path);
      }
      return changed;
    },
  };
}

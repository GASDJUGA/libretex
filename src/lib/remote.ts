/** Checks of what the user types to connect a backup with GitHub (5.9). */

/** Like `clean_url` in src-tauri/src/backup/remote.rs. */
export function validRemoteUrl(url: string): boolean {
  const u = url.trim();
  const path = "[A-Za-z0-9._~][A-Za-z0-9._/~-]*";
  const host = "[A-Za-z0-9][A-Za-z0-9.-]*";
  const https = new RegExp(`^https://${host}(:[0-9]+)?/${path}$`);
  const ssh = new RegExp(`^git@${host}:${path}$`);
  return (https.test(u) || ssh.test(u)) && !u.split(/[/:]/).includes("..");
}

/** Like `clean_repo_name`: what GitHub accepts as a repository name. */
export function validRepoName(name: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/.test(name.trim());
}

/** A GitHub repository name from the project's (no accents or spaces). */
export function repoNameFor(projectName: string): string {
  const name = projectName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(0, 100);
  return name || "proyecto-latex";
}

//! What talks to the network for the backup (5.9): the GitHub CLI (`gh`) and, for pushing and
//! pulling, the system's `git` (its credential helper / ssh agent do the authentication;
//! LibreTeX stores no token or password). Only run when the user presses a button. Programs
//! are run without a shell, with fixed arguments.

use super::{Identity, branch_name, require};
use crate::error::{AppError, AppResult};
use crate::gitops::{changed_between, git_error};
use crate::tex::detect::{find_in_path, search_path};
use crate::tex::process;
use git2::Repository;
use serde::Serialize;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Longest a push or a pull may take.
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// Longest `gh` may take to create a repository or answer who is signed in.
const GH_TIMEOUT: Duration = Duration::from_secs(60);

/// The user's `PATH` plus the usual folders of each system: an app started from the menu (or,
/// on macOS, from the Dock, which gets only `/usr/bin:/bin:/usr/sbin:/sbin`) may not see
/// where `gh` is, like Homebrew's `/opt/homebrew/bin`.
fn tools_path() -> OsString {
    search_path(&[], std::env::var_os("PATH").as_deref())
}

/// A program from [`tools_path`].
pub fn tool(name: &str) -> Option<PathBuf> {
    find_in_path(name, &tools_path())
}

/// Which of the programs the backup uses are installed (no network).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Tools {
    pub git: bool,
    pub gh: bool,
}

pub fn tools() -> Tools {
    Tools {
        git: tool("git").is_some(),
        gh: tool("gh").is_some(),
    }
}

/// Environment that keeps `git`/`gh` from waiting for input LibreTeX cannot give.
fn no_prompts(command: &mut Command) {
    command
        // What git runs in turn (the credential helper `gh auth git-credential`, `ssh`) is
        // looked up with the same folders.
        .env("PATH", tools_path())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        // Messages in English: they are classified, then shown translated.
        .env("LC_ALL", "C");
    if std::env::var_os("GIT_SSH_COMMAND").is_none() {
        command.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    }
}

/// Output of a finished program.
pub struct Output {
    pub success: bool,
    pub lines: Vec<String>,
}

impl Output {
    fn text(&self) -> String {
        self.lines.join("\n")
    }
}

/// Runs `program` with `args` (no shell) in `cwd`, passing each output line (also each
/// redrawn progress line) to `on_line`; `on_start` gets its process id (to cancel it). Killed
/// with what it started after `timeout`.
pub fn run(
    program: &Path,
    args: &[&OsStr],
    cwd: Option<&Path>,
    timeout: Duration,
    on_start: impl FnOnce(u32),
    mut on_line: impl FnMut(&str),
) -> AppResult<Output> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    no_prompts(&mut command);
    let run = process::spawn_progress(command, &program.display().to_string())?;
    let pid = run.pid();
    on_start(pid);
    let done = Arc::new(AtomicBool::new(false));
    let timer = {
        let done = done.clone();
        std::thread::spawn(move || {
            let deadline = Instant::now() + timeout;
            while Instant::now() < deadline {
                if done.load(Ordering::Relaxed) {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            if done.load(Ordering::Relaxed) {
                return false;
            }
            process::kill_group(pid);
            true
        })
    };
    let mut lines = Vec::new();
    let status = run.wait(|line| {
        on_line(&line);
        lines.push(line);
    });
    done.store(true, Ordering::Relaxed);
    if timer.join().unwrap_or(false) {
        return Err(AppError::Network(format!(
            "{}: no respondió en {} s",
            program.display(),
            timeout.as_secs()
        )));
    }
    Ok(Output {
        success: status?.success(),
        lines,
    })
}

/// The account `gh` is signed in with, as a backup author: its name and the private
/// *noreply* address GitHub gives (`<id>+<login>@users.noreply.github.com`).
pub fn github_identity() -> AppResult<Identity> {
    let gh = tool("gh").ok_or(AppError::MissingTool("gh"))?;
    let out = run(
        &gh,
        &[OsStr::new("api"), OsStr::new("user")],
        None,
        GH_TIMEOUT,
        |_| {},
        |_| {},
    )?;
    if !out.success {
        return Err(gh_error(&out.text()));
    }
    let user: serde_json::Value =
        serde_json::from_str(&out.text()).map_err(|e| AppError::Other(format!("gh: {e}")))?;
    let login = user["login"].as_str().unwrap_or("");
    let id = user["id"].as_u64().unwrap_or(0);
    if login.is_empty() || id == 0 {
        return Err(AppError::Other("gh: respuesta inesperada".into()));
    }
    let name = user["name"]
        .as_str()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or(login);
    Identity {
        name: name.to_owned(),
        email: format!("{id}+{login}@users.noreply.github.com"),
    }
    .clean()
}

/// An error of `gh`, classified.
fn gh_error(text: &str) -> AppError {
    let lower = text.to_lowercase();
    if lower.contains("gh auth login") || lower.contains("not logged") || lower.contains("401") {
        AppError::NotSignedIn(text.to_owned())
    } else if lower.contains("could not resolve")
        || lower.contains("connection")
        || lower.contains("timeout")
    {
        AppError::Network(text.to_owned())
    } else if lower.contains("name already exists") {
        AppError::AlreadyExists(PathBuf::from(text))
    } else {
        AppError::Other(format!("gh: {text}"))
    }
}

/// An error of `git push`/`fetch`/`merge`, classified.
fn git_cli_error(text: &str) -> AppError {
    let lower = text.to_lowercase();
    if lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("terminal prompts disabled")
        || lower.contains("permission denied")
        || lower.contains("invalid username or password")
        || lower.contains("403")
    {
        AppError::NotSignedIn(text.to_owned())
    } else if lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("[rejected]")
        || lower.contains("not possible to fast-forward")
        || lower.contains("diverging")
    {
        AppError::Diverged(text.to_owned())
    } else if lower.contains("would be overwritten") {
        AppError::LocalChanges(text.to_owned())
    } else if lower.contains("could not resolve host")
        || lower.contains("unable to access")
        || lower.contains("connection")
        || lower.contains("timed out")
        || lower.contains("network is unreachable")
    {
        AppError::Network(text.to_owned())
    } else if lower.contains("repository not found")
        || lower.contains("does not appear to be a git repository")
    {
        AppError::RemoteNotFound(text.to_owned())
    } else {
        AppError::Other(format!("git: {text}"))
    }
}

/// A remote URL LibreTeX accepts: `https://host/path` (without a user or password in it) or
/// `git@host:path`. Nothing that git could read as an option or a local path.
pub fn clean_url(url: &str) -> AppResult<String> {
    let url = url.trim();
    let invalid = || AppError::InvalidName {
        name: url.to_owned(),
        reason: "la dirección debe empezar con https:// o git@",
    };
    if url.is_empty() || url.len() > 500 || url.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err(invalid());
    }
    let host_path = |host: &str, path: &str| {
        !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
            && !host.starts_with(['-', '.'])
            && !path.is_empty()
            && !path.starts_with(['-', '/'])
            && path
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/' | '~'))
            && !path.split('/').any(|part| part == "..")
    };
    if let Some(rest) = url.strip_prefix("https://") {
        let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
        // A user or token in the URL would be stored in .git/config.
        if host.contains('@') || !host_path(host, path) {
            return Err(invalid());
        }
    } else if let Some(rest) = url.strip_prefix("git@") {
        let (host, path) = rest.split_once(':').ok_or_else(invalid)?;
        if host.contains(':') || !host_path(host, path) {
            return Err(invalid());
        }
    } else {
        return Err(invalid());
    }
    Ok(url.to_owned())
}

/// A name for a new GitHub repository: letters, digits, `.`, `-`, `_`.
pub fn clean_repo_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 100
        || name.starts_with(['-', '.'])
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return Err(AppError::InvalidName {
            name: name.to_owned(),
            reason: "el nombre del repositorio solo puede tener letras sin tilde, números, «.», «-» y «_»",
        });
    }
    Ok(name.to_owned())
}

/// Points `origin` at `url` (adding it if missing).
pub fn connect_url(root: &Path, url: &str) -> AppResult<String> {
    let url = clean_url(url)?;
    let repo = require(root)?;
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", &url).map_err(git_error)?;
    } else {
        repo.remote("origin", &url).map_err(git_error)?;
    }
    Ok(url)
}

/// Creates a private GitHub repository called `name` with `gh` and makes it `origin`. Returns
/// its URL. Nothing is pushed yet.
pub fn create_github_repo(
    root: &Path,
    name: &str,
    on_start: impl FnOnce(u32),
) -> AppResult<String> {
    let name = clean_repo_name(name)?;
    let repo = require(root)?;
    if repo.find_remote("origin").is_ok() {
        return Err(AppError::AlreadyExists(PathBuf::from("origin")));
    }
    let gh = tool("gh").ok_or(AppError::MissingTool("gh"))?;
    let out = run(
        &gh,
        &[
            OsStr::new("repo"),
            OsStr::new("create"),
            OsStr::new(&name),
            OsStr::new("--private"),
            OsStr::new("--source"),
            root.as_os_str(),
            OsStr::new("--remote"),
            OsStr::new("origin"),
        ],
        Some(root),
        GH_TIMEOUT,
        on_start,
        |_| {},
    )?;
    if !out.success {
        return Err(gh_error(&out.text()));
    }
    let repo = require(root)?;
    let url = repo
        .find_remote("origin")
        .ok()
        .and_then(|r| r.url().ok().map(str::to_owned))
        .ok_or_else(|| AppError::Other(format!("gh: {}", out.text())))?;
    Ok(url)
}

/// Progress of a push or a pull: the step git is in and how far, as it reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Progress {
    /// git's name for it («Writing objects», «Receiving objects»…).
    pub phase: String,
    pub percent: Option<u8>,
}

/// Reads git's progress lines (`Writing objects:  45% (9/20)`, `remote: Counting…`).
pub fn parse_progress(line: &str) -> Option<Progress> {
    let line = line.strip_prefix("remote: ").unwrap_or(line).trim();
    let (phase, rest) = line.split_once(':')?;
    if phase.is_empty() || !phase.chars().all(|c| c.is_ascii_alphabetic() || c == ' ') {
        return None;
    }
    let percent = rest
        .trim_start()
        .split_once('%')
        .and_then(|(n, _)| n.trim().parse::<u8>().ok());
    Some(Progress {
        phase: phase.to_owned(),
        percent,
    })
}

fn git_tool() -> AppResult<PathBuf> {
    tool("git").ok_or(AppError::MissingTool("git"))
}

fn origin_url(repo: &Repository) -> AppResult<String> {
    repo.find_remote("origin")
        .ok()
        .and_then(|r| r.url().ok().map(str::to_owned))
        .ok_or_else(|| {
            AppError::Forbidden("el proyecto no está conectado con un repositorio remoto".into())
        })
}

/// The current branch, if there is one with backups.
fn pushable_branch(repo: &Repository) -> AppResult<String> {
    let branch = branch_name(repo)
        .ok_or_else(|| AppError::Forbidden("no hay una rama actual (HEAD separado)".into()))?;
    if repo.head().is_err() {
        return Err(AppError::Forbidden(
            "todavía no hay respaldos que subir".into(),
        ));
    }
    Ok(branch)
}

/// `git push -u origin <branch>`.
pub fn push(
    root: &Path,
    on_start: impl FnOnce(u32),
    mut on_progress: impl FnMut(Progress),
) -> AppResult<()> {
    let git = git_tool()?;
    let branch = {
        let repo = require(root)?;
        origin_url(&repo)?;
        pushable_branch(&repo)?
    };
    let out = run(
        &git,
        &[
            OsStr::new("push"),
            OsStr::new("--progress"),
            OsStr::new("-u"),
            OsStr::new("origin"),
            OsStr::new("--"),
            OsStr::new(&branch),
        ],
        Some(root),
        NETWORK_TIMEOUT,
        on_start,
        |line| {
            if let Some(p) = parse_progress(line) {
                on_progress(p);
            }
        },
    )?;
    if out.success {
        Ok(())
    } else {
        Err(git_cli_error(&out.text()))
    }
}

/// `git fetch origin`: what GitHub has, without touching the files.
pub fn fetch(
    root: &Path,
    on_start: impl FnOnce(u32),
    mut on_progress: impl FnMut(Progress),
) -> AppResult<()> {
    let git = git_tool()?;
    origin_url(&require(root)?)?;
    let out = run(
        &git,
        &[
            OsStr::new("fetch"),
            OsStr::new("--progress"),
            OsStr::new("--prune"),
            OsStr::new("origin"),
        ],
        Some(root),
        NETWORK_TIMEOUT,
        on_start,
        |line| {
            if let Some(p) = parse_progress(line) {
                on_progress(p);
            }
        },
    )?;
    if out.success {
        Ok(())
    } else {
        Err(git_cli_error(&out.text()))
    }
}

/// What «Traer cambios» did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pulled {
    /// Remote commits brought in.
    pub commits: usize,
    /// Paths of the project that changed.
    pub changed: Vec<String>,
}

/// After a fetch: brings the remote branch in if that is a fast-forward (`git merge
/// --ff-only`, which refuses to overwrite unsaved local changes). If both sides have new
/// backups, nothing is mixed: the error explains it.
pub fn fast_forward(root: &Path) -> AppResult<Pulled> {
    let git = git_tool()?;
    let repo = require(root)?;
    let branch = branch_name(&repo)
        .ok_or_else(|| AppError::Forbidden("no hay una rama actual (HEAD separado)".into()))?;
    let remote_ref = format!("refs/remotes/origin/{branch}");
    let Ok(remote) = repo.refname_to_id(&remote_ref) else {
        // GitHub has nothing on this branch yet.
        return Ok(Pulled {
            commits: 0,
            changed: Vec::new(),
        });
    };
    let head = repo.head().ok().and_then(|h| h.target());
    let (ahead, behind) = match head {
        Some(head) => repo.graph_ahead_behind(head, remote).map_err(git_error)?,
        None => (0, super::count_commits(&repo, remote)?),
    };
    if behind == 0 {
        return Ok(Pulled {
            commits: 0,
            changed: Vec::new(),
        });
    }
    if ahead > 0 {
        return Err(AppError::Diverged(format!(
            "{ahead} respaldo(s) locales sin subir y {behind} en GitHub que no están aquí"
        )));
    }
    let out = run(
        &git,
        &[
            OsStr::new("merge"),
            OsStr::new("--ff-only"),
            OsStr::new("--no-edit"),
            OsStr::new(&remote_ref),
        ],
        Some(root),
        NETWORK_TIMEOUT,
        |_| {},
        |_| {},
    )?;
    if !out.success {
        return Err(git_cli_error(&out.text()));
    }
    Ok(Pulled {
        commits: behind,
        changed: changed_between(&repo, head, remote)?,
    })
}

/// Where a remote URL points, comparable between its `https://` and `git@` forms:
/// `github.com/ana/tesis` (lowercase, without `.git`).
pub fn repo_key(url: &str) -> Option<String> {
    let url = url.trim().trim_end_matches('/');
    let rest = if let Some(rest) = url.strip_prefix("https://") {
        rest.rsplit_once('@').map_or(rest, |(_, r)| r).to_owned()
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        rest.split_once('@').map_or(rest, |(_, r)| r).to_owned()
    } else {
        let (host, path) = url.strip_prefix("git@")?.split_once(':')?;
        format!("{host}/{path}")
    };
    let rest = rest.strip_suffix(".git").unwrap_or(&rest);
    (!rest.is_empty() && rest.contains('/')).then(|| rest.to_lowercase())
}

/// The repository's name in its URL (`…/tesis.git` → `tesis`).
pub fn repo_name(url: &str) -> Option<String> {
    let key = repo_key(url)?;
    key.rsplit('/')
        .next()
        .map(str::to_owned)
        .filter(|n| !n.is_empty())
}

/// A repository of the signed-in GitHub account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepo {
    pub name: String,
    pub name_with_owner: String,
    /// `https://github.com/<owner>/<name>`.
    pub url: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_private: bool,
    /// ISO date of the last change.
    #[serde(default)]
    pub updated_at: String,
    /// The LibreTeX project already backed up there, if any.
    #[serde(default)]
    pub project_id: Option<String>,
}

/// Most repositories listed.
const MAX_REPOS: &str = "300";

/// The signed-in account's repositories, most recently changed first (`gh repo list`).
pub fn github_repos() -> AppResult<Vec<GithubRepo>> {
    let gh = tool("gh").ok_or(AppError::MissingTool("gh"))?;
    let out = run(
        &gh,
        &[
            OsStr::new("repo"),
            OsStr::new("list"),
            OsStr::new("--limit"),
            OsStr::new(MAX_REPOS),
            OsStr::new("--json"),
            OsStr::new("name,nameWithOwner,url,description,isPrivate,updatedAt"),
        ],
        None,
        GH_TIMEOUT,
        |_| {},
        |_| {},
    )?;
    if !out.success {
        return Err(gh_error(&out.text()));
    }
    let mut repos: Vec<GithubRepo> =
        serde_json::from_str(&out.text()).map_err(|e| AppError::Other(format!("gh: {e}")))?;
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(repos)
}

/// `git clone <url> <dest>` with progress. `dest` must not exist; on failure nothing is
/// left there.
pub fn clone(
    url: &str,
    dest: &Path,
    on_start: impl FnOnce(u32),
    on_progress: impl FnMut(Progress),
) -> AppResult<()> {
    clone_from(&clean_url(url)?, dest, on_start, on_progress)
}

/// [`clone`] without checking the URL (tests use a local repository).
fn clone_from(
    url: &str,
    dest: &Path,
    on_start: impl FnOnce(u32),
    mut on_progress: impl FnMut(Progress),
) -> AppResult<()> {
    let git = git_tool()?;
    if dest.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(dest.to_owned()));
    }
    let result = run(
        &git,
        &[
            OsStr::new("clone"),
            OsStr::new("--progress"),
            OsStr::new("--"),
            OsStr::new(url),
            dest.as_os_str(),
        ],
        None,
        NETWORK_TIMEOUT,
        on_start,
        |line| {
            if let Some(p) = parse_progress(line) {
                on_progress(p);
            }
        },
    );
    let result = match result {
        Ok(out) if out.success => Ok(()),
        Ok(out) => Err(git_cli_error(&out.text())),
        Err(e) => Err(e),
    };
    if result.is_err() && dest.exists() {
        let _ = std::fs::remove_dir_all(dest);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An app opened from the Dock gets only `/usr/bin:/bin:/usr/sbin:/sbin`; `gh` from
    /// Homebrew must be found anyway (it was not, so «Desde GitHub» saw no session).
    #[cfg(target_os = "macos")]
    #[test]
    fn desde_el_dock_se_ven_las_herramientas_de_homebrew() {
        let dock = OsStr::new("/usr/bin:/bin:/usr/sbin:/sbin");
        let path = search_path(&[], Some(dock));
        assert!(std::env::split_paths(&path).any(|d| d == Path::new("/opt/homebrew/bin")));
        if Path::new("/opt/homebrew/bin/gh").exists() {
            assert_eq!(
                find_in_path("gh", &path).as_deref(),
                Some(Path::new("/opt/homebrew/bin/gh"))
            );
        }
    }

    #[test]
    fn direcciones_aceptadas() {
        for ok in [
            "https://github.com/ana/tesis.git",
            "https://github.com/ana/tesis",
            "git@github.com:ana/tesis.git",
            " https://gitlab.example.org:8443/grupo/sub/tesis.git ",
        ] {
            assert!(clean_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "http://github.com/ana/tesis.git",
            "https://ana:token@github.com/ana/tesis.git",
            "https://github.com/",
            "https://github.com/../x",
            "file:///home/ana/tesis",
            "/home/ana/tesis",
            "--upload-pack=touch /tmp/x",
            "ext::sh -c touch% /tmp/x",
            "git@github.com",
            "git@github.com:-x",
            "https://github.com/ana/te sis",
            "ssh://git@github.com/ana/tesis.git",
        ] {
            assert!(clean_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn la_misma_direccion_en_sus_formas() {
        let key = Some("github.com/ana/tesis".to_owned());
        for url in [
            "https://github.com/ana/tesis",
            "https://github.com/Ana/Tesis.git",
            "https://github.com/ana/tesis/",
            "git@github.com:ana/tesis.git",
            "ssh://git@github.com/ana/tesis.git",
        ] {
            assert_eq!(repo_key(url), key, "{url}");
        }
        assert_eq!(repo_key("/home/ana/tesis"), None);
        assert_eq!(
            repo_name("git@github.com:ana/Tesis-2.git").as_deref(),
            Some("tesis-2")
        );
    }

    #[test]
    fn lee_la_lista_de_gh() {
        let json = r#"[{"description":"","isPrivate":true,"name":"tesis","nameWithOwner":"ana/tesis","updatedAt":"2026-10-18T03:00:00Z","url":"https://github.com/ana/tesis"}]"#;
        let repos: Vec<GithubRepo> = serde_json::from_str(json).unwrap();
        assert_eq!(repos[0].name_with_owner, "ana/tesis");
        assert!(repos[0].is_private && repos[0].project_id.is_none());
    }

    #[test]
    fn clonar_trae_el_proyecto_con_su_respaldo_conectado() {
        if tool("git").is_none() {
            return;
        }
        // The first machine: a project backed up and pushed to a bare repository.
        let first = crate::backup::tests::enabled(&[("main.tex", "hola\n")]);
        let origin = tempfile::TempDir::new().unwrap();
        let mut options = git2::RepositoryInitOptions::new();
        options.bare(true).initial_head("main");
        Repository::init_opts(origin.path(), &options).unwrap();
        let origin_url = origin.path().to_str().unwrap();
        crate::backup::open(first.path())
            .unwrap()
            .unwrap()
            .remote("origin", origin_url)
            .unwrap();
        crate::backup::backup(first.path(), "v1", None).unwrap();
        push(first.path(), |_| {}, |_| {}).unwrap();

        // The second machine.
        let second = tempfile::TempDir::new().unwrap();
        let dest = second.path().join("tesis");
        let mut phases = Vec::new();
        clone_from(origin_url, &dest, |_| {}, |p| phases.push(p.phase)).unwrap();
        assert_eq!(
            std::fs::read_to_string(dest.join("main.tex")).unwrap(),
            "hola\n"
        );
        // LibreTeX's metadata, created when opening it, is not a change to back up.
        std::fs::create_dir_all(dest.join(".libretex")).unwrap();
        std::fs::write(dest.join(".libretex/project.json"), "{}").unwrap();
        std::fs::remove_file(dest.join(".gitignore")).unwrap();
        let s = crate::backup::status(&dest, None, false).unwrap();
        assert!(s.enabled && s.tracking);
        assert_eq!((s.ahead, s.behind), (0, 0));
        assert_eq!(s.remote.as_deref(), Some(origin_url));
        assert_eq!(
            crate::backup::pending(&dest).unwrap().changes,
            [crate::gitops::FileChange {
                path: ".gitignore".into(),
                kind: crate::gitops::ChangeKind::Deleted
            }]
        );
        // A folder that exists is never cloned into, and a failed clone leaves nothing.
        assert!(matches!(
            clone_from(origin_url, &dest, |_| {}, |_| {}),
            Err(AppError::AlreadyExists(_))
        ));
        let bad = second.path().join("nada");
        assert!(clone_from("/no/existe", &bad, |_| {}, |_| {}).is_err());
        assert!(!bad.exists());
        assert!(clone("file:///tmp/x", &bad, |_| {}, |_| {}).is_err());
    }

    #[test]
    fn nombres_de_repositorio() {
        assert_eq!(clean_repo_name(" tesis-2026 ").unwrap(), "tesis-2026");
        for bad in ["", "-x", ".x", "con espacio", "tésis", "a/b"] {
            assert!(clean_repo_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn progreso_de_git() {
        assert_eq!(
            parse_progress("Writing objects:  45% (9/20), 1.20 KiB | 1.20 MiB/s"),
            Some(Progress {
                phase: "Writing objects".into(),
                percent: Some(45)
            })
        );
        assert_eq!(
            parse_progress("remote: Counting objects: 100% (3/3), done."),
            Some(Progress {
                phase: "Counting objects".into(),
                percent: Some(100)
            })
        );
        assert_eq!(
            parse_progress("Enumerating objects: 5, done."),
            Some(Progress {
                phase: "Enumerating objects".into(),
                percent: None
            })
        );
        assert_eq!(parse_progress("To github.com:ana/tesis.git"), None);
        assert_eq!(parse_progress(" * [new branch]      main -> main"), None);
    }

    #[test]
    fn errores_clasificados() {
        assert!(matches!(
            git_cli_error(
                "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
            ),
            AppError::NotSignedIn(_)
        ));
        assert!(matches!(
            git_cli_error("git@github.com: Permission denied (publickey)."),
            AppError::NotSignedIn(_)
        ));
        assert!(matches!(
            git_cli_error(" ! [rejected]        main -> main (fetch first)"),
            AppError::Diverged(_)
        ));
        assert!(matches!(
            git_cli_error(
                "error: Your local changes to the following files would be overwritten by merge:\n\tmain.tex"
            ),
            AppError::LocalChanges(_)
        ));
        assert!(matches!(
            git_cli_error(
                "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com"
            ),
            AppError::Network(_)
        ));
        assert!(matches!(
            git_cli_error(
                "remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found"
            ),
            AppError::RemoteNotFound(_)
        ));
    }
}

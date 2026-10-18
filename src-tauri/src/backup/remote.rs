//! What talks to the network for the backup (5.9): the GitHub CLI (`gh`) and, for pushing and
//! pulling, the system's `git` (its credential helper / ssh agent do the authentication;
//! LibreTeX stores no token or password). Only run when the user presses a button. Programs
//! are run without a shell, with fixed arguments.

use super::Identity;
use crate::error::{AppError, AppResult};
use crate::tex::detect::find_in_path;
use crate::tex::process;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// A program from the user's `PATH` (or the usual folders, for an app started from the menu).
pub fn tool(name: &str) -> Option<PathBuf> {
    let mut path = std::env::var_os("PATH").unwrap_or_default();
    path.push(":/usr/local/bin:/usr/bin");
    find_in_path(name, &path)
}

/// Environment that keeps `git`/`gh` from waiting for input LibreTeX cannot give.
fn no_prompts(command: &mut Command) {
    command
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

/// Runs `program` with `args` (no shell) in `cwd`, passing each output line to `on_line`.
/// Killed (with what it started) after `timeout`.
pub fn run(
    program: &Path,
    args: &[&OsStr],
    cwd: Option<&Path>,
    timeout: Duration,
    mut on_line: impl FnMut(&str),
) -> AppResult<Output> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    no_prompts(&mut command);
    let run = process::spawn(command, &program.display().to_string())?;
    let pid = run.pid();
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
        Duration::from_secs(30),
        |_| {},
    )?;
    if !out.success {
        return Err(gh_error(&out.lines));
    }
    let user: serde_json::Value = serde_json::from_str(&out.lines.join("\n"))
        .map_err(|e| AppError::Other(format!("gh: {e}")))?;
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
fn gh_error(lines: &[String]) -> AppError {
    let text = lines.join("\n");
    let lower = text.to_lowercase();
    if lower.contains("gh auth login") || lower.contains("not logged") || lower.contains("401") {
        AppError::NotSignedIn(text)
    } else if lower.contains("could not resolve")
        || lower.contains("connection")
        || lower.contains("timeout")
    {
        AppError::Network(text)
    } else {
        AppError::Other(format!("gh: {text}"))
    }
}

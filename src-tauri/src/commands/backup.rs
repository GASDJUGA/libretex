//! Backup with Git and GitHub (5.9, see `crate::backup`).

use crate::backup::{self, Backup, BackupStatus, Identity, Pending, remote};
use crate::error::{AppError, AppResult};
use crate::gitops::{FileChange, VersionFile};
use crate::projects::meta::{read_meta, write_meta};
use crate::projects::ops::{Ctx, OpenFolderResult};
use crate::state::AppState;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// The author JuTeX asked for (`gitName`/`gitEmail` in `settings.json`), if any.
fn saved_identity(state: &AppState) -> Option<Identity> {
    crate::settings::load(&state.settings_file)
        .ok()
        .and_then(|s| s.git_identity())
}

/// Runs a backup operation off the main thread, one at a time; `f` gets the project root
/// and the saved author.
async fn with_backup<T, F>(state: &State<'_, AppState>, id: &str, f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Path, Option<&Identity>) -> AppResult<T> + Send + 'static,
{
    let root: PathBuf = state.ctx().path_of(id)?;
    let author = saved_identity(state);
    let lock = state.backup_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        f(&root, author.as_ref())
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

fn status_of(root: &Path, author: Option<&Identity>) -> AppResult<BackupStatus> {
    let push = read_meta(root)?.is_some_and(|m| m.backup_push);
    backup::status(root, author, push)
}

/// Where the project's backup stands (no network: remote counts as last fetched).
#[tauri::command]
pub async fn backup_status(state: State<'_, AppState>, id: String) -> AppResult<BackupStatus> {
    with_backup(&state, &id, status_of).await
}

/// Turns the backup on (`git init` if needed, `.gitignore`, author). `author` is asked only
/// when `git config` has none; it is kept in `settings.json` for the next projects.
#[tauri::command]
pub async fn backup_enable(
    state: State<'_, AppState>,
    id: String,
    author: Option<Identity>,
) -> AppResult<BackupStatus> {
    let author = author.map(|a| a.clean()).transpose()?;
    if let Some(author) = &author {
        let _guard = state
            .settings_lock
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let changes = serde_json::json!({ "gitName": author.name, "gitEmail": author.email });
        crate::settings::update(
            &state.settings_file,
            changes.as_object().expect("objeto JSON"),
        )?;
    }
    with_backup(&state, &id, move |root, saved| {
        backup::enable(root, author.as_ref().or(saved))?;
        status_of(root, author.as_ref().or(saved))
    })
    .await
}

/// The signed-in GitHub account as a backup author, with its private *noreply* address
/// (uses the network: only when the user asks for it).
#[tauri::command]
pub async fn github_identity() -> AppResult<Identity> {
    tauri::async_runtime::spawn_blocking(remote::github_identity)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Files changed since the last backup.
#[tauri::command]
pub async fn backup_pending(state: State<'_, AppState>, id: String) -> AppResult<Pending> {
    with_backup(&state, &id, |root, _| backup::pending(root)).await
}

/// Backs up the project with `message`; `None` if nothing changed.
#[tauri::command]
pub async fn backup_create(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> AppResult<Option<Backup>> {
    with_backup(&state, &id, move |root, author| {
        backup::backup(root, &message, author)
    })
    .await
}

/// The backups, newest first.
#[tauri::command]
pub async fn backup_list(state: State<'_, AppState>, id: String) -> AppResult<Vec<Backup>> {
    with_backup(&state, &id, |root, _| backup::list(root)).await
}

/// What backup `version` changed.
#[tauri::command]
pub async fn backup_changes(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<FileChange>> {
    with_backup(&state, &id, move |root, _| backup::changes(root, &version)).await
}

/// A file as it was in a backup.
#[tauri::command]
pub async fn backup_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<VersionFile> {
    with_backup(&state, &id, move |root, _| {
        backup::file_at(root, &version, &path)
    })
    .await
}

/// Brings back one file from a backup (what is there now is backed up first).
#[tauri::command]
pub async fn backup_restore_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<()> {
    let trash = state.ctx().trash.clone();
    with_backup(&state, &id, move |root, author| {
        backup::restore_file(root, &version, &path, author, trash.as_ref())
    })
    .await
}

/// Brings the project back to a backup; returns the paths that changed.
#[tauri::command]
pub async fn backup_restore(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<String>> {
    let trash = state.ctx().trash.clone();
    with_backup(&state, &id, move |root, author| {
        backup::restore_project(root, &version, author, trash.as_ref())
    })
    .await
}

/// Which of `git` and `gh` are installed (no network).
#[tauri::command]
pub fn backup_tools() -> remote::Tools {
    remote::tools()
}

/// Turns «Subir después de cada respaldo» on or off (`backupPush` in `project.json`).
#[tauri::command]
pub async fn backup_set_push(
    state: State<'_, AppState>,
    id: String,
    value: bool,
) -> AppResult<BackupStatus> {
    with_backup(&state, &id, move |root, author| {
        let mut meta = read_meta(root)?.unwrap_or_default();
        meta.backup_push = value;
        write_meta(root, &meta)?;
        status_of(root, author)
    })
    .await
}

/// Connects the project with an existing remote repository (`https://` or `git@` URL).
#[tauri::command]
pub async fn backup_connect_url(
    state: State<'_, AppState>,
    id: String,
    url: String,
) -> AppResult<BackupStatus> {
    with_backup(&state, &id, move |root, author| {
        remote::connect_url(root, &url)?;
        status_of(root, author)
    })
    .await
}

/// Progress of a network operation of the backup (event `backup-progress`).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    project_id: String,
    operation: &'static str,
    phase: String,
    percent: Option<u8>,
}

/// A network operation of a project, so it can be cancelled (one at a time per project).
struct NetJob {
    state_jobs: Arc<Mutex<HashMap<String, NetJobState>>>,
    id: String,
}

#[derive(Default)]
pub struct NetJobState {
    pid: Option<u32>,
    cancelled: bool,
}

impl NetJob {
    fn start(state: &AppState, id: &str) -> AppResult<Self> {
        let mut jobs = state.backup_jobs.lock().unwrap_or_else(|p| p.into_inner());
        if jobs.contains_key(id) {
            return Err(AppError::Forbidden(
                "ya hay una operación con el remoto en curso".into(),
            ));
        }
        jobs.insert(id.to_owned(), NetJobState::default());
        Ok(Self {
            state_jobs: state.backup_jobs.clone(),
            id: id.to_owned(),
        })
    }

    fn set_pid(&self, pid: u32) {
        if let Some(job) = self.lock().get_mut(&self.id) {
            job.pid = Some(pid);
        }
    }

    fn cancelled(&self) -> bool {
        self.lock().get(&self.id).is_some_and(|j| j.cancelled)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, NetJobState>> {
        self.state_jobs.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// A failure after «Cancelar» is a cancellation.
    fn result<T>(&self, result: AppResult<T>) -> AppResult<T> {
        match result {
            Err(_) if self.cancelled() => Err(AppError::Cancelled),
            other => other,
        }
    }
}

impl Drop for NetJob {
    fn drop(&mut self) {
        self.lock().remove(&self.id);
    }
}

/// Runs a network operation off the main thread (the repository lock is taken only where
/// `f` touches the files).
async fn with_network<T, F>(
    state: &State<'_, AppState>,
    app: AppHandle,
    id: &str,
    operation: &'static str,
    f: F,
) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Path, &NetJob, &dyn Fn(remote::Progress)) -> AppResult<T> + Send + 'static,
{
    let root: PathBuf = state.ctx().path_of(id)?;
    let job = NetJob::start(state, id)?;
    let project_id = id.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let emit = |p: remote::Progress| {
            let _ = app.emit(
                "backup-progress",
                ProgressEvent {
                    project_id: project_id.clone(),
                    operation,
                    phase: p.phase,
                    percent: p.percent,
                },
            );
        };
        let result = f(&root, &job, &emit);
        job.result(result)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// Creates a private GitHub repository with `gh` and connects the project with it.
#[tauri::command]
pub async fn backup_create_github(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    name: String,
) -> AppResult<BackupStatus> {
    let lock = state.backup_lock.clone();
    let author = saved_identity(&state);
    with_network(&state, app, &id, "create", move |root, job, _| {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        remote::create_github_repo(root, &name, |pid| job.set_pid(pid))?;
        status_of(root, author.as_ref())
    })
    .await
}

/// Pushes the backups (`git push -u origin <branch>`), with progress events.
#[tauri::command]
pub async fn backup_push(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> AppResult<BackupStatus> {
    let lock = state.backup_lock.clone();
    let author = saved_identity(&state);
    with_network(&state, app, &id, "push", move |root, job, emit| {
        remote::push(root, |pid| job.set_pid(pid), emit)?;
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        status_of(root, author.as_ref())
    })
    .await
}

/// «Traer cambios»: fetches and fast-forwards (never merges diverged work).
#[tauri::command]
pub async fn backup_pull(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> AppResult<remote::Pulled> {
    let lock = state.backup_lock.clone();
    with_network(&state, app, &id, "pull", move |root, job, emit| {
        remote::fetch(root, |pid| job.set_pid(pid), emit)?;
        if job.cancelled() {
            return Err(AppError::Cancelled);
        }
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        remote::fast_forward(root)
    })
    .await
}

/// Cancels the running network operation of a project (kills `git`/`gh` and what they
/// started).
#[tauri::command]
pub fn backup_cancel(state: State<'_, AppState>, id: String) {
    let mut jobs = state.backup_jobs.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(job) = jobs.get_mut(&id) {
        job.cancelled = true;
        if let Some(pid) = job.pid {
            crate::tex::process::kill_group(pid);
        }
    }
}

/// Remotes of the registered projects ([`remote::repo_key`] → project id).
fn known_remotes(ctx: &Ctx) -> AppResult<HashMap<String, String>> {
    Ok(ctx
        .list()?
        .into_iter()
        .filter(|p| !p.missing)
        .filter_map(|p| Some((backup::origin_key(Path::new(&p.path))?, p.id)))
        .collect())
}

/// The signed-in GitHub account's repositories (network, `gh`), each with the JuTeX
/// project already backed up there, if any.
#[tauri::command]
pub async fn github_repos(state: State<'_, AppState>) -> AppResult<Vec<remote::GithubRepo>> {
    let ctx = state.ctx();
    tauri::async_runtime::spawn_blocking(move || {
        let mut repos = remote::github_repos()?;
        let known = known_remotes(&ctx)?;
        for repo in &mut repos {
            repo.project_id = remote::repo_key(&repo.url).and_then(|k| known.get(&k).cloned());
        }
        Ok(repos)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// Key of the clone in `backup_jobs` (one at a time), for `backup_cancel`.
pub const CLONE_JOB: &str = "clone";

/// «Desde GitHub»: clones `url` into a new folder of the projects folder (named after the
/// repository) and opens it as a project; its backup is already connected. Progress as
/// `backup-progress` with operation `clone`.
#[tauri::command]
pub async fn clone_project(
    state: State<'_, AppState>,
    app: AppHandle,
    url: String,
) -> AppResult<OpenFolderResult> {
    let url = remote::clean_url(&url)?;
    let ctx = state.ctx();
    if let Some(key) = remote::repo_key(&url)
        && known_remotes(&ctx)?.contains_key(&key)
    {
        return Err(AppError::AlreadyExists(PathBuf::from(url)));
    }
    let job = NetJob::start(&state, CLONE_JOB)?;
    let registry_lock = state.registry_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let name = remote::repo_name(&url).unwrap_or_default();
        let dest = ctx.new_project_folder(&name)?;
        let emit = |p: remote::Progress| {
            let _ = app.emit(
                "backup-progress",
                ProgressEvent {
                    project_id: String::new(),
                    operation: "clone",
                    phase: p.phase,
                    percent: p.percent,
                },
            );
        };
        let cloned = remote::clone(&url, &dest, |pid| job.set_pid(pid), emit);
        job.result(cloned)?;
        let _guard = registry_lock.lock().unwrap_or_else(|p| p.into_inner());
        ctx.open_folder(&dest)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

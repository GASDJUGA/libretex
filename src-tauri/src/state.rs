//! Application state shared by the commands.

use crate::error::{AppError, AppResult};
use crate::files::watch::ProjectWatcher;
use crate::projects::ops::Ctx;
use crate::projects::trash::SystemTrash;
use crate::util::fs::read_json;
use directories::{BaseDirs, ProjectDirs};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub ctx: Ctx,
    /// Serializes operations that read-modify-write `projects.json`.
    pub registry_lock: Arc<Mutex<()>>,
    /// Watcher of the project open in the editor (one at a time).
    pub watcher: Mutex<Option<ProjectWatcher>>,
    /// LibreTeX's own TeX Live (`~/.local/share/libretex/texlive`).
    pub texlive_dir: PathBuf,
    /// Cache (`~/.cache/libretex`): downloaded installer, CTAN index.
    pub cache_dir: PathBuf,
    /// Package catalog (TeX Live database + CTAN index + installed status), built on first
    /// use and dropped when what it depends on changes.
    pub catalog: Mutex<Option<Arc<crate::tex::catalog::Catalog>>>,
    /// The running installation of LibreTeX's TeX Live, if any (one at a time).
    pub texlive_job: Mutex<Option<Arc<crate::tex::install_tl::Job>>>,
    /// `PATH` for TeX tools: LibreTeX's own TeX Live (phase 8), the official one in
    /// /usr/local/texlive, then the user's `PATH`.
    tex_path: std::sync::RwLock<std::ffi::OsString>,
    /// Compilations per project (one running, at most one pending).
    pub compile_queue: Mutex<crate::tex::queue::Queue<crate::commands::compile::CompileRequest>>,
    /// Last detection of the TeX tools (refreshed on demand).
    pub tex_status: Mutex<Option<crate::tex::detect::TexStatus>>,
    /// Paths of the last files the user dropped on the window (native event). Only these can
    /// be imported with `import_dropped`, so the webview cannot copy arbitrary paths.
    pub dropped: Mutex<Vec<PathBuf>>,
}

/// The subset of `settings.json` needed so far (the full settings arrive in phase 9).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    projects_dir: Option<PathBuf>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let dirs = ProjectDirs::from("org", "LibreTeX", "libretex")
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let home = BaseDirs::new().map(|b| b.home_dir().to_owned());
        let config_dir = dirs.config_dir().to_owned();
        let settings: Settings = read_json(&config_dir.join("settings.json"))?.unwrap_or_default();
        let projects_dir = settings
            .projects_dir
            .or_else(|| home.as_ref().map(|h| h.join("LibreTeX")))
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let templates_dir = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Other(e.to_string()))?
            .join("templates");

        Ok(Self {
            ctx: Ctx {
                registry_file: config_dir.join("projects.json"),
                projects_dir,
                templates_dir,
                home_dir: home,
                trash_log_file: dirs.data_dir().join("trashed.json"),
                trash: Arc::new(SystemTrash),
            },
            registry_lock: Arc::new(Mutex::new(())),
            watcher: Mutex::new(None),
            dropped: Mutex::new(Vec::new()),
            texlive_dir: dirs.data_dir().join("texlive"),
            cache_dir: dirs.cache_dir().to_owned(),
            texlive_job: Mutex::new(None),
            catalog: Mutex::new(None),
            tex_path: std::sync::RwLock::new(compute_tex_path(&dirs.data_dir().join("texlive"))),
            tex_status: Mutex::new(None),
            compile_queue: Mutex::new(crate::tex::queue::Queue::default()),
        })
    }
}

/// `PATH` for TeX tools: LibreTeX's TeX Live, then the official one, then the user's `PATH`.
fn compute_tex_path(texlive_dir: &std::path::Path) -> std::ffi::OsString {
    use crate::tex::detect::{search_path, texlive_bin_dirs};
    let mut extra = texlive_bin_dirs(texlive_dir);
    extra.extend(texlive_bin_dirs(std::path::Path::new("/usr/local/texlive")));
    search_path(&extra, std::env::var_os("PATH").as_deref())
}

impl AppState {
    /// The current `PATH` for TeX tools.
    pub fn tex_path(&self) -> std::ffi::OsString {
        self.tex_path
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// Recomputes the TeX `PATH` (after installing LibreTeX's TeX Live) and forgets the
    /// cached detection.
    pub fn refresh_tex_path(&self) {
        *self.tex_path.write().unwrap_or_else(|p| p.into_inner()) =
            compute_tex_path(&self.texlive_dir);
        *self.tex_status.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }
}

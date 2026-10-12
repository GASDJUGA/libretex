//! Application state shared by the commands.

use crate::error::{AppError, AppResult};
use crate::files::watch::ProjectWatcher;
use crate::projects::ops::Ctx;
use crate::projects::trash::SystemTrash;
use crate::tex::backends::{Backends, TexChoice, detect_system};
use crate::util::fs::{read_json, write_json};
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
    /// The running package operation (install/remove/update), if any (one at a time).
    pub package_job: Mutex<Option<Arc<crate::tex::install_tl::Job>>>,
    /// The running installation of LibreTeX's TeX Live, if any (one at a time).
    pub texlive_job: Mutex<Option<Arc<crate::tex::install_tl::Job>>>,
    /// `PATH` for TeX tools: the chosen TeX (see `tex::backends::tex_path`), then the
    /// user's `PATH`.
    tex_path: std::sync::RwLock<std::ffi::OsString>,
    /// Which TeX LibreTeX uses (`texDistribution` in `settings.json`).
    tex_choice: std::sync::RwLock<TexChoice>,
    /// `~/.config/libretex/settings.json`.
    settings_file: PathBuf,
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
    #[serde(default)]
    tex_distribution: TexChoice,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let dirs = ProjectDirs::from("org", "LibreTeX", "libretex")
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let home = BaseDirs::new().map(|b| b.home_dir().to_owned());
        let config_dir = dirs.config_dir().to_owned();
        let settings_file = config_dir.join("settings.json");
        let settings: Settings = read_json(&settings_file)?.unwrap_or_default();
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
            package_job: Mutex::new(None),
            tex_path: std::sync::RwLock::new(compute_tex_path(
                &dirs.data_dir().join("texlive"),
                settings.tex_distribution,
            )),
            tex_choice: std::sync::RwLock::new(settings.tex_distribution),
            settings_file,
            tex_status: Mutex::new(None),
            compile_queue: Mutex::new(crate::tex::queue::Queue::default()),
        })
    }
}

/// `PATH` for TeX tools: the active backend's TeX first, then the user's `PATH`.
fn compute_tex_path(texlive_dir: &std::path::Path, choice: TexChoice) -> std::ffi::OsString {
    let backends = detect_system(texlive_dir, choice);
    crate::tex::backends::tex_path(texlive_dir, &backends, std::env::var_os("PATH").as_deref())
}

impl AppState {
    /// The current `PATH` for TeX tools.
    pub fn tex_path(&self) -> std::ffi::OsString {
        self.tex_path
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// Recomputes the TeX `PATH` (after installing LibreTeX's TeX Live or choosing another
    /// TeX) and forgets the cached detection and package catalog.
    pub fn refresh_tex_path(&self) {
        *self.tex_path.write().unwrap_or_else(|p| p.into_inner()) =
            compute_tex_path(&self.texlive_dir, self.tex_choice());
        *self.tex_status.lock().unwrap_or_else(|p| p.into_inner()) = None;
        *self.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    pub fn tex_choice(&self) -> TexChoice {
        *self.tex_choice.read().unwrap_or_else(|p| p.into_inner())
    }

    /// The package backends of this machine and the active one (the TeX used to compile).
    pub fn backends(&self) -> Backends {
        detect_system(&self.texlive_dir, self.tex_choice())
    }

    /// Saves the user's choice of TeX in `settings.json` (keeping its other keys) and
    /// switches to it.
    pub fn set_tex_choice(&self, choice: TexChoice) -> AppResult<()> {
        let mut settings: serde_json::Map<String, serde_json::Value> =
            read_json(&self.settings_file)?.unwrap_or_default();
        settings.insert(
            "texDistribution".into(),
            serde_json::to_value(choice).map_err(|e| AppError::Other(e.to_string()))?,
        );
        write_json(&self.settings_file, &settings)?;
        *self.tex_choice.write().unwrap_or_else(|p| p.into_inner()) = choice;
        self.refresh_tex_path();
        Ok(())
    }
}

//! Package manager commands (5.6).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::backends::{BackendKind, Backends, SYSTEM_TLPDB, TexChoice};
use crate::tex::catalog::{
    Catalog, Installed, InstalledList, PackageHit, Status, pacman_collections,
};
use crate::tex::install_tl::{self, Job, Progress};
use crate::tex::{ctan, tlmgr, tlpdb};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// Runs blocking work off the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// The package backends found and the active one.
#[tauri::command]
pub async fn package_backends(state: State<'_, AppState>) -> AppResult<Backends> {
    let managed = state.texlive_dir.clone();
    let choice = state.tex_choice();
    blocking(move || Ok(crate::tex::backends::detect_system(&managed, choice))).await
}

/// Chooses which TeX JuTeX uses (JuTeX's TeX Live or the system's) to compile and to
/// manage packages; saved in `settings.json`. Returns the backends with the new active one.
#[tauri::command]
pub async fn set_tex_distribution(
    state: State<'_, AppState>,
    choice: TexChoice,
) -> AppResult<Backends> {
    if state
        .package_job
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .is_some()
        || state
            .texlive_job
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .is_some()
    {
        return Err(AppError::Other(
            "espera a que termine la operación de paquetes en curso".into(),
        ));
    }
    state.set_tex_choice(choice)?;
    Ok(state.backends())
}

/// Where the catalog's TeX Live database comes from.
fn catalog_tlpdb(cache_dir: &Path, backends: &Backends) -> Option<PathBuf> {
    let cached = ctan::tlpdb_file(cache_dir);
    if cached.is_file() {
        return Some(cached);
    }
    if Path::new(SYSTEM_TLPDB).is_file() {
        return Some(PathBuf::from(SYSTEM_TLPDB));
    }
    let root = backends.active.as_ref()?.root.as_ref()?;
    let own = Path::new(root).join("tlpkg/texlive.tlpdb");
    own.is_file().then_some(own)
}

/// Builds the catalog for the active backend.
fn build_catalog(cache_dir: &Path, backends: &Backends, path: &std::ffi::OsStr) -> Catalog {
    // MiKTeX has its own database: its packages, not TeX Live's, are the ones it can install.
    if let Some(b) = backends
        .active
        .as_ref()
        .filter(|b| b.kind == BackendKind::Miktex)
        && let Some((db, installed)) = b
            .tlmgr
            .as_deref()
            .and_then(|miktex| crate::tex::miktex::read_catalog(Path::new(miktex), path))
    {
        return Catalog::new(db, ctan::load_index(cache_dir), Installed::Names(installed));
    }
    let read = |path: &Path| tlpdb::parse(&std::fs::read_to_string(path).unwrap_or_default());
    let tl = catalog_tlpdb(cache_dir, backends)
        .map(|p| read(&p))
        .unwrap_or_default();
    let installed = match backends.active.as_ref() {
        Some(b)
            if matches!(
                b.kind,
                BackendKind::Managed | BackendKind::Official | BackendKind::OfficialReadOnly
            ) =>
        {
            b.root
                .as_ref()
                .map(|root| read(&Path::new(root).join("tlpkg/texlive.tlpdb")))
                .map(|db| Installed::Names(db.packages.into_keys().collect()))
                .unwrap_or(Installed::Unknown)
        }
        Some(b) if b.kind == BackendKind::Pacman => crate::platform::process::command("pacman")
            .arg("-Qq")
            .output()
            .ok()
            .map(|o| {
                Installed::PacmanCollections(pacman_collections(&String::from_utf8_lossy(
                    &o.stdout,
                )))
            })
            .unwrap_or(Installed::Unknown),
        _ => Installed::Unknown,
    };
    Catalog::new(tl, ctan::load_index(cache_dir), installed)
}

/// The cached catalog, built if needed.
async fn catalog(state: &State<'_, AppState>) -> AppResult<Arc<Catalog>> {
    if let Some(catalog) = state
        .catalog
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
    {
        return Ok(catalog);
    }
    let managed = state.texlive_dir.clone();
    let choice = state.tex_choice();
    let cache = state.cache_dir.clone();
    let path = state.tex_path();
    let built = blocking(move || {
        let backends = crate::tex::backends::detect_system(&managed, choice);
        Ok(Arc::new(build_catalog(&cache, &backends, &path)))
    })
    .await?;
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = Some(built.clone());
    Ok(built)
}

/// Fills unknown statuses with `kpsewhich` (one call for all): installed if one of the
/// package's style files is found.
fn fill_with_kpsewhich(hits: &mut [PackageHit], path: &std::ffi::OsStr) {
    let files: Vec<&String> = hits
        .iter()
        .filter(|h| h.status == Status::Unknown)
        .filter_map(|h| h.styles.first())
        .collect();
    let Some(kpsewhich) = crate::tex::detect::find_in_path("kpsewhich", path) else {
        return;
    };
    if files.is_empty() {
        return;
    }
    let Ok(output) = crate::platform::process::command(kpsewhich)
        .args(&files)
        .env("PATH", path)
        .output()
    else {
        return;
    };
    let found: std::collections::HashSet<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.rsplit('/').next().map(str::to_owned))
        .collect();
    for hit in hits.iter_mut().filter(|h| h.status == Status::Unknown) {
        if let Some(style) = hit.styles.first() {
            hit.status = if found.contains(style) {
                Status::Installed
            } else {
                Status::Missing
            };
        }
    }
}

/// Packages matching `query` (TeX Live and CTAN), best first.
#[tauri::command]
pub async fn search_packages(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<PackageHit>> {
    let catalog = catalog(&state).await?;
    let path = state.tex_path();
    blocking(move || {
        let mut hits = catalog.search(&query, 60);
        fill_with_kpsewhich(&mut hits, &path);
        Ok(hits)
    })
    .await
}

/// The installed packages of the active TeX whose name or description contains `filter`,
/// by name (at most `limit`, with the total).
#[tauri::command]
pub async fn installed_packages(
    state: State<'_, AppState>,
    filter: String,
    limit: usize,
) -> AppResult<InstalledList> {
    let catalog = catalog(&state).await?;
    blocking(move || Ok(catalog.installed(&filter, limit.min(5000)))).await
}

/// The package that provides a style or class file (`physics.sty`), if known.
#[tauri::command]
pub async fn package_for_file(
    state: State<'_, AppState>,
    file: String,
) -> AppResult<Option<PackageHit>> {
    let catalog = catalog(&state).await?;
    let path = state.tex_path();
    blocking(move || {
        let mut hit: Vec<PackageHit> = catalog.package_for_file(&file).into_iter().collect();
        fill_with_kpsewhich(&mut hit, &path);
        Ok(hit.pop())
    })
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogInfo {
    pub ctan: ctan::IndexInfo,
    /// The full TeX Live database was downloaded (ms), or null (the system's is used).
    pub texlive_saved_at: Option<u64>,
}

fn catalog_info(cache_dir: &Path) -> CatalogInfo {
    CatalogInfo {
        ctan: ctan::IndexInfo {
            saved_at: ctan::saved_at(&ctan::index_file(cache_dir)),
            packages: ctan::load_index(cache_dir).len(),
        },
        texlive_saved_at: ctan::saved_at(&ctan::tlpdb_file(cache_dir)),
    }
}

/// What the catalog's offline data is and how fresh.
#[tauri::command]
pub async fn package_catalog_info(state: State<'_, AppState>) -> AppResult<CatalogInfo> {
    let cache = state.cache_dir.clone();
    blocking(move || Ok(catalog_info(&cache))).await
}

/// Downloads CTAN's index (and TeX Live's database when the system has no full one): only
/// when the user asks. The catalog is rebuilt on the next search.
#[tauri::command]
pub async fn refresh_package_catalog(state: State<'_, AppState>) -> AppResult<CatalogInfo> {
    let cache = state.cache_dir.clone();
    let info = blocking(move || {
        ctan::download(ctan::INDEX_URL, &ctan::index_file(&cache))?;
        if !Path::new(SYSTEM_TLPDB).is_file() {
            ctan::download(ctan::TLPDB_URL, &ctan::tlpdb_file(&cache))?;
        }
        Ok(catalog_info(&cache))
    })
    .await?;
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
    Ok(info)
}

/// Forgets the cached catalog so the next search reads again what is installed (after the
/// user installed something with pacman, for example). No network.
#[tauri::command]
pub fn reload_package_status(state: State<'_, AppState>) {
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
}

/// Installs JuTeX's TeX Live (downloads it from CTAN: only when the user asks). Progress
/// arrives as `texlive-install` events; returns when it finishes (or fails, or is cancelled).
#[tauri::command]
pub async fn install_managed_texlive(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let job = {
        let mut slot = state.texlive_job.lock().unwrap_or_else(|p| p.into_inner());
        if slot.is_some() {
            return Err(AppError::Other(
                "ya hay una instalación de TeX Live en curso".into(),
            ));
        }
        let job = Arc::new(Job::default());
        *slot = Some(job.clone());
        job
    };
    let root = state.texlive_dir.clone();
    let work = state.cache_dir.join("install-tl");
    let result = tauri::async_runtime::spawn_blocking(move || {
        install_tl::install(&root, &work, &job, &mut |progress: Progress| {
            let _ = app.emit("texlive-install", progress);
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()));
    *state.texlive_job.lock().unwrap_or_else(|p| p.into_inner()) = None;
    let texdir = result??;
    // Unless the user chose the system's TeX, JuTeX's TeX Live is used from now on
    // (compiling and the catalog).
    state.refresh_tex_path();
    Ok(texdir.display().to_string())
}

/// Cancels the running installation (its partial files are removed).
#[tauri::command]
pub fn cancel_managed_texlive(state: State<'_, AppState>) {
    if let Some(job) = state
        .texlive_job
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
    {
        job.cancel();
    }
}

/// The program that changes the active backend's packages: `tlmgr`, or `miktex` for MiKTeX.
fn writable_tlmgr(state: &State<'_, AppState>) -> AppResult<(BackendKind, PathBuf)> {
    state
        .backends()
        .active
        .filter(|b| b.writable)
        .and_then(|b| Some((b.kind, PathBuf::from(b.tlmgr?))))
        .ok_or_else(|| AppError::Forbidden("el TeX Live activo es de solo lectura".into()))
}

/// Installs, removes or updates a package with tlmgr (one operation at a time). Progress
/// arrives as `package-operation` events.
#[tauri::command]
pub async fn package_operation(
    app: AppHandle,
    state: State<'_, AppState>,
    operation: tlmgr::Operation,
    name: String,
) -> AppResult<()> {
    let (kind, tlmgr_path) = writable_tlmgr(&state)?;
    let job = {
        let mut slot = state.package_job.lock().unwrap_or_else(|p| p.into_inner());
        let installing = state
            .texlive_job
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .is_some();
        if slot.is_some() || installing {
            return Err(AppError::Other(
                "ya hay una operación de paquetes en curso".into(),
            ));
        }
        let job = Arc::new(Job::default());
        *slot = Some(job.clone());
        job
    };
    let result = blocking(move || {
        let mut on = |progress: Progress| {
            let _ = app.emit("package-operation", progress);
        };
        if kind == BackendKind::Miktex {
            crate::tex::miktex::run(&tlmgr_path, operation, &name, &job, &mut on)
        } else {
            tlmgr::run(&tlmgr_path, operation, &name, &job, &mut on)
        }
    })
    .await;
    *state.package_job.lock().unwrap_or_else(|p| p.into_inner()) = None;
    // Statuses changed (also after a failed or cancelled operation: tlmgr may have done part).
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
    result
}

#[tauri::command]
pub fn cancel_package_operation(state: State<'_, AppState>) {
    if let Some(job) = state
        .package_job
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
    {
        job.cancel();
    }
}

/// Whether the repository has a newer version of an installed package (network).
#[tauri::command]
pub async fn check_package_update(state: State<'_, AppState>, name: String) -> AppResult<bool> {
    let (kind, tlmgr_path) = writable_tlmgr(&state)?;
    blocking(move || {
        if kind == BackendKind::Miktex {
            crate::tex::miktex::has_update(&tlmgr_path, &name)
        } else {
            tlmgr::has_update(&tlmgr_path, &name)
        }
    })
    .await
}

/// Opens the package's documentation: the local one if TeX Live has it, else its CTAN page
/// in the browser. Returns `"local"` or `"ctan"`.
#[tauri::command]
pub async fn open_package_docs(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> AppResult<String> {
    use tauri_plugin_opener::OpenerExt;
    let path = state.tex_path();
    let lookup = name.clone();
    let local = blocking(move || Ok(tlmgr::local_docs(&lookup, &path))).await?;
    let opener = app.opener();
    match local {
        Some(file) => {
            opener
                .open_path(file.to_string_lossy(), None::<&str>)
                .map_err(|e| AppError::Other(e.to_string()))?;
            Ok("local".into())
        }
        None => {
            opener
                .open_url(tlmgr::ctan_page(&name)?, None::<&str>)
                .map_err(|e| AppError::Other(e.to_string()))?;
            Ok("ctan".into())
        }
    }
}

/// Commands and environments defined by the packages the document loads and those they load
/// (for completion). Read from the style files of the active TeX and of the project folder.
#[tauri::command]
pub async fn package_definitions(
    state: State<'_, AppState>,
    id: String,
    packages: Vec<String>,
) -> AppResult<Vec<crate::tex::definitions::Definition>> {
    let root = crate::commands::projects::with_ctx(&state, move |ctx| ctx.path_of(&id)).await?;
    let path = state.tex_path();
    blocking(move || Ok(crate::tex::definitions::collect(&root, &packages, &path))).await
}

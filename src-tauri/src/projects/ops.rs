//! Project operations used by the Tauri commands. Everything here works on explicit paths
//! (`Ctx`) so it can be tested against temporary folders.

use crate::error::{AppError, AppResult};
use crate::projects::detect::{detect_compiler, main_file_candidates};
use crate::projects::meta::{META_DIR, ProjectMeta, read_meta, write_meta};
use crate::projects::registry::{Entry, Registry, now_ms};
use crate::projects::trash::{LogEntry, TrashBin, read_log, write_log};
use crate::projects::{templates, zip_import};
use crate::util::paths::{resolve_existing, validate_name};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

/// Folders under `.libretex/` that are regenerated and not worth duplicating.
const NOT_COPIED: [&str; 2] = ["build", "history.git"];
/// Limit for the walk that finds the last modification time.
const MAX_FILES_FOR_MTIME: usize = 10_000;

const BLANK_MAIN: &str = "\\documentclass[11pt,a4paper]{article}\n\n\
% Idioma y fuentes (compilar con XeLaTeX)\n\
\\usepackage{fontspec}\n\
\\usepackage[spanish]{babel}\n\n\
\\begin{document}\n\n\n\n\
\\end{document}\n";

/// Locations and services used by the operations.
#[derive(Clone)]
pub struct Ctx {
    /// `projects.json`.
    pub registry_file: PathBuf,
    /// Where new and imported projects are created (`~/LibreTeX` by default).
    pub projects_dir: PathBuf,
    /// Bundled templates.
    pub templates_dir: PathBuf,
    /// Home folder, to show paths as `~/…`.
    pub home_dir: Option<PathBuf>,
    /// `trashed.json`: projects LibreTeX sent to the trash.
    pub trash_log_file: PathBuf,
    /// The desktop trash (a fake one in tests).
    pub trash: Arc<dyn TrashBin>,
}

/// A project in the system trash that LibreTeX put there.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedProject {
    /// Identifier of the item in the trash.
    pub trash_id: String,
    pub name: String,
    pub original_path: String,
    pub display_path: String,
    /// Milliseconds since the Unix epoch.
    pub trashed_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub display_path: String,
    /// Milliseconds since the Unix epoch; `None` if unknown.
    pub modified_at: Option<u64>,
    pub opened_at: Option<u64>,
    pub compiler: crate::projects::meta::Compiler,
    pub main_file: String,
    /// The folder no longer exists.
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFolderResult {
    pub project: ProjectSummary,
    /// `.tex` files with `\documentclass`; when there are several the user picks one.
    pub candidates: Vec<String>,
}

impl Ctx {
    fn registry(&self) -> AppResult<Registry> {
        Registry::load(&self.registry_file)
    }

    fn display(&self, path: &Path) -> String {
        if let Some(home) = &self.home_dir
            && let Ok(rel) = path.strip_prefix(home)
        {
            return if rel.as_os_str().is_empty() {
                "~".to_owned()
            } else {
                format!("~/{}", rel.display())
            };
        }
        path.display().to_string()
    }

    fn summary(&self, entry: &Entry) -> ProjectSummary {
        let missing = !entry.path.is_dir();
        let meta = if missing {
            None
        } else {
            read_meta(&entry.path).ok().flatten()
        };
        let meta = meta.unwrap_or_default();
        ProjectSummary {
            id: entry.id.clone(),
            name: entry
                .path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| entry.path.display().to_string()),
            path: entry.path.display().to_string(),
            display_path: self.display(&entry.path),
            modified_at: if missing {
                None
            } else {
                last_modified(&entry.path)
            },
            opened_at: entry.opened_at,
            compiler: meta.compiler,
            main_file: meta.main_file,
            missing,
        }
    }

    fn entry(&self, registry: &Registry, id: &str) -> AppResult<Entry> {
        registry
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::UnknownProject(id.to_owned()))
    }

    pub fn list(&self) -> AppResult<Vec<ProjectSummary>> {
        Ok(self
            .registry()?
            .entries
            .iter()
            .map(|e| self.summary(e))
            .collect())
    }

    pub fn templates(&self) -> AppResult<Vec<templates::TemplateInfo>> {
        templates::list(&self.templates_dir)
    }

    /// Creates `projects_dir/name`, empty (a minimal `main.tex`) or from `template`.
    pub fn create(&self, name: &str, template: Option<&str>) -> AppResult<ProjectSummary> {
        validate_name(name)?;
        fs::create_dir_all(&self.projects_dir).map_err(|e| AppError::io(&self.projects_dir, e))?;
        let dest = self.projects_dir.join(name);
        if dest.symlink_metadata().is_ok() {
            return Err(AppError::AlreadyExists(dest));
        }
        if let Some(id) = template {
            // Fail before creating anything if the template does not exist.
            templates::find(&self.templates_dir, id)?;
        }
        fs::create_dir(&dest).map_err(|e| AppError::io(&dest, e))?;

        let result = (|| {
            let meta = match template {
                Some(id) => {
                    let info = templates::copy_into(&self.templates_dir, id, &dest)?;
                    ProjectMeta {
                        main_file: info.main_file,
                        compiler: info.compiler,
                        ..Default::default()
                    }
                }
                None => {
                    let main = dest.join("main.tex");
                    fs::write(&main, BLANK_MAIN).map_err(|e| AppError::io(&main, e))?;
                    ProjectMeta::default()
                }
            };
            write_meta(&dest, &meta)?;
            self.register(dest.canonicalize().map_err(|e| AppError::io(&dest, e))?)
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&dest);
        }
        result
    }

    /// Registers an existing folder as a project, creating its metadata if needed.
    pub fn open_folder(&self, folder: &Path) -> AppResult<OpenFolderResult> {
        let folder = folder.canonicalize().map_err(|e| AppError::io(folder, e))?;
        if !folder.is_dir() {
            return Err(AppError::NotFound(folder));
        }
        let candidates = main_file_candidates(&folder);
        if read_meta(&folder)?.is_none() {
            let main_file = candidates
                .first()
                .cloned()
                .unwrap_or_else(|| "main.tex".to_owned());
            let source = fs::read_to_string(folder.join(&main_file)).unwrap_or_default();
            let meta = ProjectMeta {
                main_file,
                compiler: detect_compiler(&source),
                ..Default::default()
            };
            write_meta(&folder, &meta)?;
        }
        let project = self.register(folder)?;
        Ok(OpenFolderResult {
            project,
            candidates,
        })
    }

    /// Extracts a ZIP into a new folder under `projects_dir` named after the file.
    pub fn import_zip(&self, zip_path: &Path) -> AppResult<OpenFolderResult> {
        let stem = zip_path
            .file_stem()
            .map(|s| s.to_string_lossy().trim().to_owned())
            .filter(|s| validate_name(s).is_ok())
            .unwrap_or_else(|| "Proyecto importado".to_owned());
        fs::create_dir_all(&self.projects_dir).map_err(|e| AppError::io(&self.projects_dir, e))?;
        let dest = unique_child(&self.projects_dir, &stem, None);
        if let Err(e) = zip_import::extract(zip_path, &dest) {
            let _ = fs::remove_dir_all(&dest);
            return Err(e);
        }
        self.open_folder(&dest)
    }

    pub fn set_main_file(&self, id: &str, rel: &str) -> AppResult<ProjectSummary> {
        let registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        let path = resolve_existing(&entry.path, rel)?;
        if !path.is_file() || path.extension().is_none_or(|e| e != "tex") {
            return Err(AppError::InvalidName {
                name: rel.to_owned(),
                reason: "no es un archivo .tex",
            });
        }
        let mut meta = read_meta(&entry.path)?.unwrap_or_default();
        meta.main_file = crate::util::paths::to_relative(
            &entry
                .path
                .canonicalize()
                .map_err(|e| AppError::io(&entry.path, e))?,
            &path,
        )?;
        write_meta(&entry.path, &meta)?;
        Ok(self.summary(&entry))
    }

    /// Changes the compiler in `project.json`. Shell escape is deliberately not settable from
    /// here (it needs an explicit warning in the UI).
    pub fn update_meta(
        &self,
        id: &str,
        compiler: crate::projects::meta::Compiler,
    ) -> AppResult<ProjectSummary> {
        let registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        let mut meta = read_meta(&entry.path)?.unwrap_or_default();
        meta.compiler = compiler;
        write_meta(&entry.path, &meta)?;
        Ok(self.summary(&entry))
    }

    /// Marks the project as opened now and returns it.
    pub fn open(&self, id: &str) -> AppResult<ProjectSummary> {
        let mut registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        if !entry.path.is_dir() {
            return Err(AppError::NotFound(entry.path));
        }
        let stored = registry.get_mut(id).expect("entry exists");
        stored.opened_at = Some(now_ms());
        let entry = stored.clone();
        registry.save()?;
        Ok(self.summary(&entry))
    }

    /// Renames the project folder (in place) to `new_name`.
    pub fn rename(&self, id: &str, new_name: &str) -> AppResult<ProjectSummary> {
        validate_name(new_name)?;
        let mut registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        let parent = entry
            .path
            .parent()
            .ok_or_else(|| AppError::NotFound(entry.path.clone()))?;
        let target = parent.join(new_name);
        if target == entry.path {
            return Ok(self.summary(&entry));
        }
        if target.symlink_metadata().is_ok() {
            return Err(AppError::AlreadyExists(target));
        }
        fs::rename(&entry.path, &target).map_err(|e| AppError::io(&entry.path, e))?;
        let stored = registry.get_mut(id).expect("entry exists");
        stored.path = target;
        let entry = stored.clone();
        registry.save()?;
        Ok(self.summary(&entry))
    }

    /// Copies the project next to the original as «name (copia)».
    pub fn duplicate(&self, id: &str) -> AppResult<ProjectSummary> {
        let registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        let parent = entry
            .path
            .parent()
            .ok_or_else(|| AppError::NotFound(entry.path.clone()))?;
        let name = entry
            .path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let dest = unique_child(parent, &name, Some("copia"));
        if let Err(e) = copy_project(&entry.path, &dest) {
            let _ = fs::remove_dir_all(&dest);
            return Err(e);
        }
        self.register(dest)
    }

    /// Sends the project folder to the trash and forgets it.
    pub fn trash(&self, id: &str) -> AppResult<()> {
        let mut registry = self.registry()?;
        let entry = self.entry(&registry, id)?;
        if entry.path.exists() {
            self.trash.delete(&entry.path)?;
            let mut log = read_log(&self.trash_log_file)?;
            log.push(LogEntry {
                path: entry.path.clone(),
                trashed_at: now_ms(),
            });
            write_log(&self.trash_log_file, &log)?;
        }
        registry.remove(id);
        registry.save()
    }

    /// Projects LibreTeX sent to the trash that are still there, most recent first. Entries
    /// for items restored or emptied from the desktop are dropped from `trashed.json`.
    pub fn list_trashed(&self) -> AppResult<Vec<TrashedProject>> {
        let items = self.trash.list()?;
        let log = read_log(&self.trash_log_file)?;
        let kept: Vec<LogEntry> = log
            .iter()
            .filter(|e| items.iter().any(|i| i.original_path == e.path))
            .cloned()
            .collect();
        if kept.len() != log.len() {
            write_log(&self.trash_log_file, &kept)?;
        }

        let mut trashed: Vec<TrashedProject> = items
            .into_iter()
            .filter_map(|item| {
                let trashed_at = kept
                    .iter()
                    .filter(|e| e.path == item.original_path)
                    .map(|e| e.trashed_at)
                    .max()?;
                Some(TrashedProject {
                    name: item
                        .original_path
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    original_path: item.original_path.display().to_string(),
                    display_path: self.display(&item.original_path),
                    trash_id: item.id,
                    trashed_at,
                })
            })
            .collect();
        trashed.sort_by(|a, b| {
            b.trashed_at
                .cmp(&a.trashed_at)
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(trashed)
    }

    /// Moves a trashed project back to where it was and lists it again.
    pub fn restore_trashed(&self, trash_id: &str) -> AppResult<ProjectSummary> {
        let item = self.trashed_item(trash_id)?;
        self.trash.restore(trash_id)?;
        let summary = self.register(PathBuf::from(&item.original_path))?;
        self.list_trashed()?; // drops the log entry if nothing else is trashed from that path
        Ok(summary)
    }

    /// Permanently deletes a trashed project.
    pub fn purge_trashed(&self, trash_id: &str) -> AppResult<()> {
        self.trashed_item(trash_id)?;
        self.trash.purge(trash_id)?;
        self.list_trashed()?;
        Ok(())
    }

    /// Only items LibreTeX trashed can be restored or purged from the app.
    fn trashed_item(&self, trash_id: &str) -> AppResult<TrashedProject> {
        self.list_trashed()?
            .into_iter()
            .find(|t| t.trash_id == trash_id)
            .ok_or_else(|| AppError::UnknownProject(trash_id.to_owned()))
    }

    /// Removes the project from the list without touching its files.
    pub fn forget(&self, id: &str) -> AppResult<()> {
        let mut registry = self.registry()?;
        registry
            .remove(id)
            .ok_or_else(|| AppError::UnknownProject(id.to_owned()))?;
        registry.save()
    }

    pub fn path_of(&self, id: &str) -> AppResult<PathBuf> {
        Ok(self.entry(&self.registry()?, id)?.path)
    }

    fn register(&self, path: PathBuf) -> AppResult<ProjectSummary> {
        let mut registry = self.registry()?;
        let entry = registry.add(path);
        registry.save()?;
        Ok(self.summary(&entry))
    }
}

/// `parent/base`, or `parent/base (suffix)`, `parent/base (suffix 2)`… (or `base (2)`… with
/// no suffix) — the first that does not exist.
fn unique_child(parent: &Path, base: &str, suffix: Option<&str>) -> PathBuf {
    let first = match suffix {
        Some(s) => parent.join(format!("{base} ({s})")),
        None => parent.join(base),
    };
    if first.symlink_metadata().is_err() {
        return first;
    }
    (2..)
        .map(|n| match suffix {
            Some(s) => parent.join(format!("{base} ({s} {n})")),
            None => parent.join(format!("{base} ({n})")),
        })
        .find(|p| p.symlink_metadata().is_err())
        .expect("an unused name exists")
}

/// Latest modification time of the project's files (ignoring `.libretex/` and hidden folders).
fn last_modified(root: &Path) -> Option<u64> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .take(MAX_FILES_FOR_MTIME)
        .filter_map(|e| e.metadata().ok()?.modified().ok())
        .filter_map(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .max()
}

/// Recursively copies a project, skipping regenerated `.libretex/` folders. Symlinks are
/// recreated as symlinks (never followed).
fn copy_project(src: &Path, dest: &Path) -> AppResult<()> {
    let skip: Vec<PathBuf> = NOT_COPIED
        .iter()
        .map(|d| src.join(META_DIR).join(d))
        .collect();
    for entry in WalkDir::new(src)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !skip.iter().any(|s| e.path() == s))
    {
        let entry = entry.map_err(|e| AppError::Other(e.to_string()))?;
        let rel = entry
            .path()
            .strip_prefix(src)
            .expect("walkdir yields paths under src");
        let target = dest.join(rel);
        let file_type = entry.file_type();
        if file_type.is_dir() {
            fs::create_dir_all(&target).map_err(|e| AppError::io(&target, e))?;
        } else if file_type.is_symlink() {
            #[cfg(unix)]
            {
                let link =
                    fs::read_link(entry.path()).map_err(|e| AppError::io(entry.path(), e))?;
                std::os::unix::fs::symlink(link, &target).map_err(|e| AppError::io(&target, e))?;
            }
        } else {
            fs::copy(entry.path(), &target).map_err(|e| AppError::io(&target, e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::meta::Compiler;
    use crate::projects::trash::fake::FakeTrash;
    use crate::projects::zip_import::tests::make_zip;
    use tempfile::TempDir;

    struct Fixture {
        tmp: TempDir,
        ctx: Ctx,
    }

    fn fixture() -> Fixture {
        let tmp = TempDir::new().unwrap();
        let ctx = Ctx {
            registry_file: tmp.path().join("config/projects.json"),
            projects_dir: tmp.path().join("LibreTeX"),
            templates_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("../templates"),
            home_dir: Some(tmp.path().to_owned()),
            trash_log_file: tmp.path().join("data/trashed.json"),
            trash: Arc::new(FakeTrash::new(tmp.path().join("papelera"))),
        };
        Fixture { tmp, ctx }
    }

    #[test]
    fn crea_desde_plantilla_y_lo_lista() {
        let f = fixture();
        let p = f.ctx.create("Tesis", Some("articulo-xelatex-es")).unwrap();
        assert_eq!(p.name, "Tesis");
        assert_eq!(p.display_path, "~/LibreTeX/Tesis");
        assert_eq!(p.compiler, Compiler::Xelatex);
        assert_eq!(p.main_file, "main.tex");
        assert!(!p.missing && p.modified_at.is_some() && p.opened_at.is_none());
        let dir = f.ctx.projects_dir.join("Tesis");
        assert!(dir.join("main.tex").is_file() && dir.join("referencias.bib").is_file());
        assert!(dir.join(".libretex/project.json").is_file());

        let list = f.ctx.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, p.id);
    }

    #[test]
    fn crea_proyecto_vacio_con_main_minimo() {
        let f = fixture();
        f.ctx.create("Vacío", None).unwrap();
        let main = fs::read_to_string(f.ctx.projects_dir.join("Vacío/main.tex")).unwrap();
        assert!(main.contains("\\documentclass") && main.contains("{babel}"));
    }

    #[test]
    fn crear_valida_nombre_duplicados_y_plantilla() {
        let f = fixture();
        f.ctx.create("A", None).unwrap();
        assert!(matches!(
            f.ctx.create("A", None),
            Err(AppError::AlreadyExists(_))
        ));
        assert!(matches!(
            f.ctx.create("../fuera", None),
            Err(AppError::InvalidName { .. })
        ));
        assert!(matches!(
            f.ctx.create("B", Some("nada")),
            Err(AppError::UnknownTemplate(_))
        ));
        assert!(!f.ctx.projects_dir.join("B").exists());
        assert!(!f.tmp.path().join("fuera").exists());
    }

    #[test]
    fn abrir_carpeta_detecta_principal_y_compilador() {
        let f = fixture();
        let dir = f.tmp.path().join("externo");
        fs::create_dir_all(dir.join("caps")).unwrap();
        fs::write(
            dir.join("tesis.tex"),
            "\\documentclass{book}\n\\usepackage[utf8]{inputenc}",
        )
        .unwrap();
        fs::write(dir.join("caps/1.tex"), "\\chapter{Uno}").unwrap();

        let r = f.ctx.open_folder(&dir).unwrap();
        assert_eq!(r.candidates, ["tesis.tex"]);
        assert_eq!(r.project.main_file, "tesis.tex");
        assert_eq!(r.project.compiler, Compiler::Pdflatex);
        assert_eq!(r.project.display_path, "~/externo");

        // Volver a abrirla no la duplica y conserva su id.
        let again = f.ctx.open_folder(&dir).unwrap();
        assert_eq!(again.project.id, r.project.id);
        assert_eq!(f.ctx.list().unwrap().len(), 1);
    }

    #[test]
    fn abrir_carpeta_con_varios_candidatos_y_elegir_principal() {
        let f = fixture();
        let dir = f.tmp.path().join("varios");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.tex"), "\\documentclass{article}").unwrap();
        fs::write(dir.join("b.tex"), "\\documentclass{article}").unwrap();
        let r = f.ctx.open_folder(&dir).unwrap();
        assert_eq!(r.candidates, ["a.tex", "b.tex"]);

        let p = f.ctx.set_main_file(&r.project.id, "b.tex").unwrap();
        assert_eq!(p.main_file, "b.tex");
        assert!(matches!(
            f.ctx.set_main_file(&r.project.id, "../a.tex"),
            Err(AppError::ParentComponent(_))
        ));
        assert!(matches!(
            f.ctx.set_main_file(&r.project.id, "no.tex"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn importa_zip_de_overleaf() {
        let f = fixture();
        let zip = f.tmp.path().join("Mi informe.zip");
        make_zip(
            &zip,
            &[
                (
                    "main.tex",
                    "\\documentclass{article}\n\\usepackage{fontspec}",
                ),
                ("fig/a.png", "x"),
            ],
        );
        let r = f.ctx.import_zip(&zip).unwrap();
        assert_eq!(r.project.name, "Mi informe");
        assert_eq!(r.project.compiler, Compiler::Xelatex);
        assert_eq!(r.candidates, ["main.tex"]);

        // Un segundo import con el mismo nombre no pisa el primero.
        let r2 = f.ctx.import_zip(&zip).unwrap();
        assert_eq!(r2.project.name, "Mi informe (2)");
    }

    #[test]
    fn importar_zip_invalido_no_deja_restos() {
        let f = fixture();
        let zip = f.tmp.path().join("malo.zip");
        make_zip(&zip, &[("../fuera.tex", "x")]);
        assert!(matches!(
            f.ctx.import_zip(&zip),
            Err(AppError::InvalidZip(_))
        ));
        assert!(!f.ctx.projects_dir.join("malo").exists());
        assert!(f.ctx.list().unwrap().is_empty());
    }

    #[test]
    fn renombra_duplica_y_olvida() {
        let f = fixture();
        let p = f.ctx.create("Original", Some("apuntes")).unwrap();
        fs::create_dir_all(f.ctx.projects_dir.join("Original/.libretex/build")).unwrap();
        fs::write(
            f.ctx.projects_dir.join("Original/.libretex/build/main.pdf"),
            "pdf",
        )
        .unwrap();

        let renamed = f.ctx.rename(&p.id, "Apuntes de física").unwrap();
        assert_eq!(renamed.id, p.id);
        assert_eq!(renamed.name, "Apuntes de física");
        assert!(!f.ctx.projects_dir.join("Original").exists());

        f.ctx.create("Otro", None).unwrap();
        assert!(matches!(
            f.ctx.rename(&p.id, "Otro"),
            Err(AppError::AlreadyExists(_))
        ));
        assert!(matches!(
            f.ctx.rename(&p.id, "a/b"),
            Err(AppError::InvalidName { .. })
        ));

        let copy = f.ctx.duplicate(&p.id).unwrap();
        assert_eq!(copy.name, "Apuntes de física (copia)");
        assert_ne!(copy.id, p.id);
        let copy_dir = f.ctx.projects_dir.join("Apuntes de física (copia)");
        assert!(copy_dir.join("capitulos/01-introduccion.tex").is_file());
        assert!(copy_dir.join(".libretex/project.json").is_file());
        assert!(!copy_dir.join(".libretex/build").exists());
        assert_eq!(
            f.ctx.duplicate(&p.id).unwrap().name,
            "Apuntes de física (copia 2)"
        );

        f.ctx.forget(&copy.id).unwrap();
        assert!(copy_dir.exists(), "olvidar no borra archivos");
        assert_eq!(f.ctx.list().unwrap().len(), 3);
    }

    #[test]
    fn abrir_actualiza_la_fecha_y_detecta_carpetas_borradas() {
        let f = fixture();
        let p = f.ctx.create("X", None).unwrap();
        let opened = f.ctx.open(&p.id).unwrap();
        assert!(opened.opened_at.is_some());

        fs::remove_dir_all(f.ctx.projects_dir.join("X")).unwrap();
        assert!(f.ctx.list().unwrap()[0].missing);
        assert!(matches!(f.ctx.open(&p.id), Err(AppError::NotFound(_))));
        assert!(matches!(
            f.ctx.open("nada"),
            Err(AppError::UnknownProject(_))
        ));
    }

    #[test]
    fn papelera_listar_restaurar_y_eliminar_definitivamente() {
        let f = fixture();
        let a = f.ctx.create("A", None).unwrap();
        let b = f.ctx.create("B", Some("tarea")).unwrap();
        let dir_a = f.ctx.projects_dir.join("A");

        f.ctx.trash(&a.id).unwrap();
        f.ctx.trash(&b.id).unwrap();
        assert!(!dir_a.exists());
        assert!(f.ctx.list().unwrap().is_empty());

        // Same millisecond is possible here, so look items up by name instead of by order.
        let trashed = f.ctx.list_trashed().unwrap();
        let by_name = |name: &str| trashed.iter().find(|t| t.name == name).unwrap().clone();
        assert_eq!(trashed.len(), 2);
        assert_eq!(by_name("A").display_path, "~/LibreTeX/A");

        let restored = f.ctx.restore_trashed(&by_name("A").trash_id).unwrap();
        assert_eq!(restored.name, "A");
        assert!(dir_a.join("main.tex").is_file());
        assert_eq!(f.ctx.list().unwrap().len(), 1);

        f.ctx.purge_trashed(&by_name("B").trash_id).unwrap();
        assert!(f.ctx.list_trashed().unwrap().is_empty());
        assert!(read_log(&f.ctx.trash_log_file).unwrap().is_empty());
    }

    #[test]
    fn restaurar_no_pisa_una_carpeta_nueva_con_el_mismo_nombre() {
        let f = fixture();
        let a = f.ctx.create("A", None).unwrap();
        f.ctx.trash(&a.id).unwrap();
        f.ctx.create("A", None).unwrap();
        let id = f.ctx.list_trashed().unwrap()[0].trash_id.clone();
        assert!(matches!(
            f.ctx.restore_trashed(&id),
            Err(AppError::AlreadyExists(_))
        ));
        assert_eq!(
            f.ctx.list_trashed().unwrap().len(),
            1,
            "sigue en la papelera"
        );
    }

    #[test]
    fn la_papelera_solo_muestra_y_toca_proyectos_de_libretex() {
        let f = fixture();
        let other = f.tmp.path().join("otro");
        fs::create_dir_all(&other).unwrap();
        f.ctx.trash.delete(&other).unwrap(); // borrado desde el escritorio, no desde LibreTeX
        assert!(f.ctx.list_trashed().unwrap().is_empty());
        let id = f.ctx.trash.list().unwrap()[0].id.clone();
        assert!(matches!(
            f.ctx.purge_trashed(&id),
            Err(AppError::UnknownProject(_))
        ));
    }

    #[test]
    fn vaciar_la_papelera_desde_el_escritorio_limpia_la_lista() {
        let tmp = TempDir::new().unwrap();
        let fake = Arc::new(FakeTrash::new(tmp.path().join("papelera")));
        let ctx = Ctx {
            registry_file: tmp.path().join("config/projects.json"),
            projects_dir: tmp.path().join("LibreTeX"),
            templates_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("../templates"),
            home_dir: None,
            trash_log_file: tmp.path().join("data/trashed.json"),
            trash: fake.clone(),
        };
        let a = ctx.create("A", None).unwrap();
        ctx.trash(&a.id).unwrap();
        assert_eq!(ctx.list_trashed().unwrap().len(), 1);
        fake.empty();
        assert!(ctx.list_trashed().unwrap().is_empty());
        assert!(read_log(&ctx.trash_log_file).unwrap().is_empty());
    }

    #[test]
    fn actualiza_el_compilador() {
        let f = fixture();
        let p = f.ctx.create("X", None).unwrap();
        let p = f.ctx.update_meta(&p.id, Compiler::Lualatex).unwrap();
        assert_eq!(p.compiler, Compiler::Lualatex);
        let meta = read_meta(&f.ctx.path_of(&p.id).unwrap()).unwrap().unwrap();
        assert_eq!(meta.compiler, Compiler::Lualatex);
    }
}

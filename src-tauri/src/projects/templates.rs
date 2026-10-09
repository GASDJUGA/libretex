//! Project templates bundled from the repository's `templates/` folder.
//!
//! Each template is a folder with a `template.json` descriptor plus the files that are copied
//! into a new project.

use crate::error::{AppError, AppResult};
use crate::projects::meta::Compiler;
use crate::util::fs::read_json;
use crate::util::paths::validate_name;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

const DESCRIPTOR: &str = "template.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Localized {
    pub es: String,
    pub en: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Descriptor {
    order: u32,
    #[serde(default)]
    default: bool,
    name: Localized,
    description: Localized,
    main_file: String,
    compiler: Compiler,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: Localized,
    pub description: Localized,
    pub main_file: String,
    pub compiler: Compiler,
    pub default: bool,
}

/// Lists the templates under `root`, sorted by their `order`.
pub fn list(root: &Path) -> AppResult<Vec<TemplateInfo>> {
    let mut found = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| AppError::io(root, e))? {
        let entry = entry.map_err(|e| AppError::io(root, e))?;
        let dir = entry.path();
        let Some(descriptor) = read_json::<Descriptor>(&dir.join(DESCRIPTOR))? else {
            continue;
        };
        let id = entry.file_name().to_string_lossy().into_owned();
        found.push((
            descriptor.order,
            TemplateInfo {
                id,
                name: descriptor.name,
                description: descriptor.description,
                main_file: descriptor.main_file,
                compiler: descriptor.compiler,
                default: descriptor.default,
            },
        ));
    }
    found.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    Ok(found.into_iter().map(|(_, t)| t).collect())
}

/// Finds template `id` under `root`.
pub fn find(root: &Path, id: &str) -> AppResult<TemplateInfo> {
    validate_name(id).map_err(|_| AppError::UnknownTemplate(id.to_owned()))?;
    list(root)?
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| AppError::UnknownTemplate(id.to_owned()))
}

/// Copies the files of template `id` (everything except its descriptor) into `dest`,
/// which must already exist.
pub fn copy_into(root: &Path, id: &str, dest: &Path) -> AppResult<TemplateInfo> {
    let info = find(root, id)?;
    let src = root.join(&info.id);
    for entry in WalkDir::new(&src).min_depth(1).follow_links(false) {
        let entry = entry.map_err(|e| AppError::Other(e.to_string()))?;
        let rel = entry
            .path()
            .strip_prefix(&src)
            .expect("walkdir yields paths under src");
        if rel == Path::new(DESCRIPTOR) {
            continue;
        }
        let target = dest.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| AppError::io(&target, e))?;
        } else if entry.file_type().is_file() {
            fs::copy(entry.path(), &target).map_err(|e| AppError::io(&target, e))?;
        }
    }
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn repo_templates() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../templates")
    }

    #[test]
    fn las_plantillas_del_repo_son_validas() {
        let templates = list(&repo_templates()).unwrap();
        let ids: Vec<_> = templates.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["articulo-xelatex-es", "apuntes", "tarea", "beamer"]);

        let defaults: Vec<_> = templates.iter().filter(|t| t.default).collect();
        assert_eq!(defaults.len(), 1);
        assert_eq!(defaults[0].id, "articulo-xelatex-es");
        assert_eq!(defaults[0].compiler, Compiler::Xelatex);

        for t in &templates {
            let main = repo_templates().join(&t.id).join(&t.main_file);
            let source = fs::read_to_string(&main).unwrap_or_else(|_| panic!("{main:?}"));
            assert!(source.contains("\\documentclass"), "{}", t.id);
            assert!(!t.name.es.is_empty() && !t.name.en.is_empty(), "{}", t.id);
        }
    }

    #[test]
    fn copia_los_archivos_sin_el_descriptor() {
        let dest = TempDir::new().unwrap();
        let info = copy_into(&repo_templates(), "apuntes", dest.path()).unwrap();
        assert_eq!(info.main_file, "main.tex");
        assert!(dest.path().join("main.tex").is_file());
        assert!(dest.path().join("capitulos/01-introduccion.tex").is_file());
        assert!(!dest.path().join(DESCRIPTOR).exists());
    }

    #[test]
    fn rechaza_ids_desconocidos_o_peligrosos() {
        let dest = TempDir::new().unwrap();
        for id in ["no-existe", "../src", "", "."] {
            assert!(
                matches!(
                    copy_into(&repo_templates(), id, dest.path()),
                    Err(AppError::UnknownTemplate(_))
                ),
                "{id}"
            );
        }
    }
}

//! Operations on the files of a project. Every function takes the project root and paths
//! relative to it (as sent by the frontend), validated with `util::paths`.

pub mod watch;

use crate::error::{AppError, AppResult};
use crate::projects::meta::META_DIR;
use crate::projects::trash::TrashBin;
use crate::util::fs::atomic_write;
use crate::util::paths::{resolve_existing, resolve_new, to_relative, validate_name};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Files bigger than this are not opened in the editor.
pub const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024;
/// Safety limit for listing huge folders.
const MAX_TREE_ENTRIES: usize = 20_000;
/// Folders hidden from the tree.
const HIDDEN_DIRS: [&str; 2] = [META_DIR, ".git"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileNode {
    pub kind: NodeKind,
    pub name: String,
    /// Relative to the project root, with `/` separators.
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub content: String,
    /// Milliseconds since the Unix epoch.
    pub modified_at: u64,
}

/// The project's files and folders, folders first, then case-insensitive alphabetical order.
/// `.libretex/` and `.git/` are hidden; symlinks are listed only if they stay inside the root.
pub fn list_tree(root: &Path) -> AppResult<Vec<FileNode>> {
    let root = root.canonicalize().map_err(|e| AppError::io(root, e))?;
    let mut budget = MAX_TREE_ENTRIES;
    list_dir(&root, &root, &mut budget)
}

fn list_dir(root: &Path, dir: &Path, budget: &mut usize) -> AppResult<Vec<FileNode>> {
    let mut nodes = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| AppError::io(dir, e))? {
        if *budget == 0 {
            break;
        }
        let entry = entry.map_err(|e| AppError::io(dir, e))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if dir == root && HIDDEN_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        let Ok(resolved) = path.canonicalize() else {
            continue;
        };
        if !resolved.starts_with(root) {
            continue; // symlink pointing outside the project
        }
        *budget -= 1;
        let rel = to_relative(root, &path)?;
        if resolved.is_dir() {
            // A symlink to a parent folder would loop forever; only real folders are walked.
            let is_link = entry.file_type().map(|t| t.is_symlink()).unwrap_or(false);
            let children = if is_link {
                Vec::new()
            } else {
                list_dir(root, &path, budget)?
            };
            nodes.push(FileNode {
                kind: NodeKind::Folder,
                name,
                path: rel,
                children: Some(children),
            });
        } else {
            nodes.push(FileNode {
                kind: NodeKind::File,
                name,
                path: rel,
                children: None,
            });
        }
    }
    nodes.sort_by(|a, b| {
        (a.kind == NodeKind::File)
            .cmp(&(b.kind == NodeKind::File))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(nodes)
}

fn modified_ms(path: &Path) -> AppResult<u64> {
    let meta = fs::metadata(path).map_err(|e| AppError::io(path, e))?;
    Ok(meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0))
}

/// Rejects the root itself and anything inside `.libretex/`.
fn ensure_user_path(rel: &str) -> AppResult<()> {
    let first = Path::new(rel).components().find_map(|c| match c {
        std::path::Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
        _ => None,
    });
    match first {
        None => Err(AppError::Forbidden("la raíz del proyecto".into())),
        Some(name) if name == META_DIR => Err(AppError::Forbidden(format!("{META_DIR}/"))),
        Some(_) => Ok(()),
    }
}

/// Reads a UTF-8 text file (a leading BOM is dropped).
pub fn read_text(root: &Path, rel: &str) -> AppResult<TextFile> {
    ensure_user_path(rel)?;
    let path = resolve_existing(root, rel)?;
    if !path.is_file() {
        return Err(AppError::NotText(path));
    }
    let size = fs::metadata(&path)
        .map_err(|e| AppError::io(&path, e))?
        .len();
    if size > MAX_TEXT_BYTES {
        return Err(AppError::TooLarge(path));
    }
    let bytes = fs::read(&path).map_err(|e| AppError::io(&path, e))?;
    let mut content = String::from_utf8(bytes).map_err(|_| AppError::NotText(path.clone()))?;
    if content.starts_with('\u{feff}') {
        content.remove(0);
    }
    Ok(TextFile {
        content,
        modified_at: modified_ms(&path)?,
    })
}

/// Writes a text file atomically (creating it and its folders if needed). Returns the new
/// modification time.
pub fn write_text(root: &Path, rel: &str, content: &str) -> AppResult<u64> {
    ensure_user_path(rel)?;
    let path = resolve_new(root, rel)?;
    if path.is_dir() {
        return Err(AppError::AlreadyExists(path));
    }
    if path.symlink_metadata().is_err() {
        check_new_name(rel)?;
    }
    atomic_write(&path, content.as_bytes())?;
    modified_ms(&path)
}

/// Creates a new file; fails if something already exists there.
pub fn create_file(root: &Path, rel: &str, content: &str) -> AppResult<()> {
    ensure_user_path(rel)?;
    check_new_name(rel)?;
    let path = resolve_new(root, rel)?;
    if path.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(path));
    }
    atomic_write(&path, content.as_bytes())
}

/// Creates a new folder (and missing parents); fails if something already exists there.
pub fn create_folder(root: &Path, rel: &str) -> AppResult<()> {
    ensure_user_path(rel)?;
    check_new_name(rel)?;
    let path = resolve_new(root, rel)?;
    if path.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(path));
    }
    fs::create_dir_all(&path).map_err(|e| AppError::io(&path, e))
}

/// Every component of a new path must be a valid name (folders created on the way included).
fn check_new_name(rel: &str) -> AppResult<()> {
    for component in Path::new(rel).components() {
        if let std::path::Component::Normal(name) = component {
            validate_name(&name.to_string_lossy())?;
        }
    }
    Ok(())
}

/// Path inside `root` of an existing entry, without following a final symlink (so a link is
/// renamed, moved or deleted itself, never its target).
fn existing_entry(root: &Path, rel: &str) -> AppResult<PathBuf> {
    ensure_user_path(rel)?;
    let parent_rel = Path::new(rel)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let name = Path::new(rel)
        .file_name()
        .ok_or_else(|| AppError::Forbidden(rel.to_owned()))?;
    let parent = resolve_existing(root, &parent_rel)?;
    let path = parent.join(name);
    if path.symlink_metadata().is_err() {
        return Err(AppError::NotFound(path));
    }
    Ok(path)
}

fn canonical_root(root: &Path) -> AppResult<PathBuf> {
    root.canonicalize().map_err(|e| AppError::io(root, e))
}

/// Renames an entry within its folder; returns its new relative path.
pub fn rename(root: &Path, rel: &str, new_name: &str) -> AppResult<String> {
    validate_name(new_name)?;
    let from = existing_entry(root, rel)?;
    let to = from.with_file_name(new_name);
    if to == from {
        return to_relative(&canonical_root(root)?, &to);
    }
    if to.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(to));
    }
    fs::rename(&from, &to).map_err(|e| AppError::io(&from, e))?;
    to_relative(&canonical_root(root)?, &to)
}

/// Moves an entry into `dest_folder` (`""` for the root); returns its new relative path.
pub fn move_entry(root: &Path, rel: &str, dest_folder: &str) -> AppResult<String> {
    let from = existing_entry(root, rel)?;
    if Path::new(dest_folder).components().next().is_some() {
        ensure_user_path(dest_folder)?;
    }
    let dest = resolve_existing(root, dest_folder)?;
    if !dest.is_dir() {
        return Err(AppError::NotFound(dest));
    }
    if dest.starts_with(&from) {
        return Err(AppError::Forbidden(
            "mover una carpeta dentro de sí misma".into(),
        ));
    }
    let to = dest.join(from.file_name().expect("existing entry has a name"));
    if to == from {
        return to_relative(&canonical_root(root)?, &to);
    }
    if to.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(to));
    }
    fs::rename(&from, &to).map_err(|e| AppError::io(&from, e))?;
    to_relative(&canonical_root(root)?, &to)
}

/// Copies an entry next to itself as «name (copia).ext»; returns the new relative path.
pub fn duplicate(root: &Path, rel: &str) -> AppResult<String> {
    let from = existing_entry(root, rel)?;
    let parent = from.parent().expect("entry inside the root");
    let to = unique_path(
        parent,
        &from.file_name().expect("has name").to_string_lossy(),
        Some("copia"),
    );
    copy_recursive(&from, &to)?;
    to_relative(&canonical_root(root)?, &to)
}

/// Sends an entry to the system trash.
pub fn delete(root: &Path, rel: &str, trash: &dyn TrashBin) -> AppResult<()> {
    let path = existing_entry(root, rel)?;
    trash.delete(&path)
}

/// Copies files or folders from outside the project (the user's upload or drop) into
/// `dest_folder`, renaming on collisions; returns the new relative paths.
pub fn import(root: &Path, dest_folder: &str, sources: &[PathBuf]) -> AppResult<Vec<String>> {
    if Path::new(dest_folder).components().next().is_some() {
        ensure_user_path(dest_folder)?;
    }
    let dest = resolve_existing(root, dest_folder)?;
    if !dest.is_dir() {
        return Err(AppError::NotFound(dest));
    }
    let root = canonical_root(root)?;
    let mut added = Vec::new();
    for source in sources {
        let meta = source
            .symlink_metadata()
            .map_err(|e| AppError::io(source, e))?;
        if meta.file_type().is_symlink() {
            continue;
        }
        let name = source
            .file_name()
            .ok_or_else(|| AppError::NotFound(source.clone()))?
            .to_string_lossy()
            .into_owned();
        let target = unique_path(&dest, &name, None);
        if target.starts_with(source) {
            return Err(AppError::Forbidden(
                "copiar una carpeta dentro de sí misma".into(),
            ));
        }
        copy_recursive(source, &target)?;
        added.push(to_relative(&root, &target)?);
    }
    Ok(added)
}

/// `dir/name`, or `dir/stem (suffix).ext`, `dir/stem (suffix 2).ext`, … — the first unused.
/// With no suffix the alternatives are `stem (2).ext`, `stem (3).ext`, …
fn unique_path(dir: &Path, name: &str, suffix: Option<&str>) -> PathBuf {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let candidate = |n: u32| -> PathBuf {
        let label = match (suffix, n) {
            (None, 1) => return dir.join(name),
            (None, n) => format!("{n}"),
            (Some(s), 1) => s.to_owned(),
            (Some(s), n) => format!("{s} {n}"),
        };
        dir.join(format!("{stem} ({label}){ext}"))
    };
    (1..)
        .map(candidate)
        .find(|p| p.symlink_metadata().is_err())
        .expect("an unused name exists")
}

/// Recursive copy that never follows symlinks (they are skipped).
fn copy_recursive(from: &Path, to: &Path) -> AppResult<()> {
    let meta = from.symlink_metadata().map_err(|e| AppError::io(from, e))?;
    if meta.is_dir() {
        fs::create_dir_all(to).map_err(|e| AppError::io(to, e))?;
        for entry in fs::read_dir(from).map_err(|e| AppError::io(from, e))? {
            let entry = entry.map_err(|e| AppError::io(from, e))?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(from, to).map_err(|e| AppError::io(to, e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::trash::fake::FakeTrash;
    use tempfile::TempDir;

    fn project() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("p");
        fs::create_dir_all(root.join("capitulos")).unwrap();
        fs::create_dir_all(root.join(".libretex/build")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("main.tex"), "\\documentclass{article}").unwrap();
        fs::write(root.join("B.bib"), "").unwrap();
        fs::write(root.join("a.png"), [0x89, 0x50, 0xff, 0xfe]).unwrap();
        fs::write(root.join("capitulos/intro.tex"), "Hola").unwrap();
        fs::write(root.join(".libretex/project.json"), "{}").unwrap();
        (tmp, root)
    }

    fn names(nodes: &[FileNode]) -> Vec<&str> {
        nodes.iter().map(|n| n.name.as_str()).collect()
    }

    #[test]
    fn arbol_con_carpetas_primero_y_sin_carpetas_internas() {
        let (_t, root) = project();
        let tree = list_tree(&root).unwrap();
        assert_eq!(names(&tree), ["capitulos", "a.png", "B.bib", "main.tex"]);
        let caps = &tree[0];
        assert_eq!(caps.kind, NodeKind::Folder);
        assert_eq!(
            caps.children.as_ref().unwrap()[0].path,
            "capitulos/intro.tex"
        );
    }

    #[cfg(unix)]
    #[test]
    fn arbol_omite_symlinks_hacia_fuera_y_no_entra_en_bucles() {
        let (t, root) = project();
        std::os::unix::fs::symlink(t.path(), root.join("fuera")).unwrap();
        std::os::unix::fs::symlink(&root, root.join("capitulos/bucle")).unwrap();
        let tree = list_tree(&root).unwrap();
        assert!(!names(&tree).contains(&"fuera"));
        let caps = tree[0].children.as_ref().unwrap();
        let bucle = caps.iter().find(|n| n.name == "bucle").unwrap();
        assert_eq!(bucle.children.as_deref(), Some(&[][..]));
    }

    #[test]
    fn lee_y_escribe_texto() {
        let (_t, root) = project();
        assert_eq!(
            read_text(&root, "capitulos/intro.tex").unwrap().content,
            "Hola"
        );
        write_text(&root, "capitulos/intro.tex", "Chao").unwrap();
        assert_eq!(
            fs::read_to_string(root.join("capitulos/intro.tex")).unwrap(),
            "Chao"
        );
        write_text(&root, "nuevo/dir/x.tex", "x").unwrap();
        assert!(root.join("nuevo/dir/x.tex").is_file());
    }

    #[test]
    fn lectura_rechaza_binarios_bom_se_quita() {
        let (_t, root) = project();
        assert!(matches!(
            read_text(&root, "a.png"),
            Err(AppError::NotText(_))
        ));
        assert!(matches!(
            read_text(&root, "capitulos"),
            Err(AppError::NotText(_))
        ));
        fs::write(root.join("bom.tex"), "\u{feff}Hola").unwrap();
        assert_eq!(read_text(&root, "bom.tex").unwrap().content, "Hola");
    }

    #[test]
    fn protege_la_raiz_y_libretex() {
        let (_t, root) = project();
        for rel in ["", ".", ".libretex/project.json", ".libretex"] {
            assert!(
                matches!(read_text(&root, rel), Err(AppError::Forbidden(_))),
                "{rel}"
            );
            assert!(
                matches!(rename(&root, rel, "x"), Err(AppError::Forbidden(_))),
                "{rel}"
            );
        }
        assert!(matches!(
            write_text(&root, ".libretex/project.json", "x"),
            Err(AppError::Forbidden(_))
        ));
        assert!(matches!(
            move_entry(&root, "main.tex", ".libretex"),
            Err(AppError::Forbidden(_))
        ));
        assert!(matches!(
            read_text(&root, "../p/main.tex"),
            Err(AppError::ParentComponent(_))
        ));
    }

    #[test]
    fn crea_archivos_y_carpetas_sin_pisar() {
        let (_t, root) = project();
        create_file(&root, "capitulos/nuevo.tex", "").unwrap();
        assert!(matches!(
            create_file(&root, "main.tex", ""),
            Err(AppError::AlreadyExists(_))
        ));
        create_folder(&root, "figuras/2026").unwrap();
        assert!(root.join("figuras/2026").is_dir());
        assert!(matches!(
            create_folder(&root, "capitulos"),
            Err(AppError::AlreadyExists(_))
        ));
        assert!(matches!(
            create_file(&root, "a /x.tex", ""),
            Err(AppError::InvalidName { .. })
        ));
        assert!(!root.join("a ").exists());
        assert!(matches!(
            create_file(&root, "capitulos/ x.tex", ""),
            Err(AppError::InvalidName { .. })
        ));
    }

    #[test]
    fn renombra_y_mueve() {
        let (_t, root) = project();
        assert_eq!(
            rename(&root, "capitulos/intro.tex", "uno.tex").unwrap(),
            "capitulos/uno.tex"
        );
        assert!(matches!(
            rename(&root, "B.bib", "main.tex"),
            Err(AppError::AlreadyExists(_))
        ));
        assert!(matches!(
            rename(&root, "B.bib", "a/b"),
            Err(AppError::InvalidName { .. })
        ));

        assert_eq!(
            move_entry(&root, "B.bib", "capitulos").unwrap(),
            "capitulos/B.bib"
        );
        assert_eq!(move_entry(&root, "capitulos/B.bib", "").unwrap(), "B.bib");
        assert!(matches!(
            move_entry(&root, "capitulos", "capitulos"),
            Err(AppError::Forbidden(_))
        ));
        create_folder(&root, "capitulos/sub").unwrap();
        assert!(matches!(
            move_entry(&root, "capitulos", "capitulos/sub"),
            Err(AppError::Forbidden(_))
        ));
        assert!(matches!(
            move_entry(&root, "no.tex", ""),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn duplica_archivos_y_carpetas() {
        let (_t, root) = project();
        assert_eq!(duplicate(&root, "main.tex").unwrap(), "main (copia).tex");
        assert_eq!(duplicate(&root, "main.tex").unwrap(), "main (copia 2).tex");
        assert_eq!(duplicate(&root, "capitulos").unwrap(), "capitulos (copia)");
        assert!(root.join("capitulos (copia)/intro.tex").is_file());
    }

    #[test]
    fn elimina_a_la_papelera() {
        let (t, root) = project();
        let trash = FakeTrash::new(t.path().join("papelera"));
        delete(&root, "capitulos", &trash).unwrap();
        assert!(!root.join("capitulos").exists());
        assert_eq!(trash.list().unwrap().len(), 1);
        assert!(matches!(
            delete(&root, ".libretex", &trash),
            Err(AppError::Forbidden(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn renombrar_o_borrar_un_symlink_no_toca_su_destino() {
        let (t, root) = project();
        std::os::unix::fs::symlink(root.join("main.tex"), root.join("enlace.tex")).unwrap();
        rename(&root, "enlace.tex", "otro.tex").unwrap();
        assert!(root.join("main.tex").is_file());
        let trash = FakeTrash::new(t.path().join("papelera"));
        delete(&root, "otro.tex", &trash).unwrap();
        assert!(root.join("main.tex").is_file());
    }

    #[test]
    fn importa_archivos_externos_sin_pisar() {
        let (t, root) = project();
        let ext = t.path().join("externos");
        fs::create_dir_all(ext.join("figs")).unwrap();
        fs::write(ext.join("main.tex"), "otro").unwrap();
        fs::write(ext.join("figs/g.png"), "png").unwrap();
        let added = import(
            &root,
            "capitulos",
            &[ext.join("main.tex"), ext.join("figs")],
        )
        .unwrap();
        assert_eq!(added, ["capitulos/main.tex", "capitulos/figs"]);
        let again = import(&root, "", &[ext.join("main.tex")]).unwrap();
        assert_eq!(again, ["main (2).tex"]);
        assert_eq!(
            fs::read_to_string(root.join("main.tex")).unwrap(),
            "\\documentclass{article}"
        );
        assert!(matches!(
            import(&root, ".libretex", &[ext.join("main.tex")]),
            Err(AppError::Forbidden(_))
        ));
    }
}

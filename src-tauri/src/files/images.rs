//! Images pasted into the editor (pedido del usuario: pegar una captura de pantalla). The
//! bytes come from the system clipboard (read in Rust: WebKitGTK doesn't hand images to the
//! page) and are saved in the project's figures folder under a name the user chose.

use crate::error::{AppError, AppResult};
use crate::files::ensure_user_folder;
use crate::util::fs::atomic_write;
use crate::util::paths::resolve_new;
use std::path::Path;

/// Larger images are refused (a screenshot is a few MB).
pub const MAX_IMAGE_BYTES: usize = 50 * 1024 * 1024;

/// Formats LaTeX can include directly (`\includegraphics` with pdfLaTeX, XeLaTeX, LuaLaTeX).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
}

impl ImageKind {
    /// What the bytes really are, by their signature (not by what the clipboard claims).
    pub fn of(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Self::Png)
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Some(Self::Jpeg)
        } else {
            None
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

/// A file name LaTeX reads without trouble: letters, digits, `-` and `_` (no spaces, dots or
/// accents: `\includegraphics` and some engines choke on them), at most 80 characters.
pub fn check_image_name(name: &str) -> AppResult<()> {
    let ok = !name.is_empty()
        && name.len() <= 80
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!("nombre de imagen «{name}»")))
    }
}

/// Saves `bytes` as `<folder>/<name>.<ext>` (`folder` relative to the root, `""` = the root;
/// created if missing). Never overwrites a file. Returns the path relative to the root.
pub fn save_image(root: &Path, folder: &str, name: &str, bytes: &[u8]) -> AppResult<String> {
    check_image_name(name)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(AppError::Forbidden("imagen de más de 50 MB".into()));
    }
    let kind = ImageKind::of(bytes).ok_or_else(|| {
        AppError::Forbidden("el portapapeles no tiene una imagen PNG o JPEG".into())
    })?;
    let folder = folder.trim_matches('/');
    if !folder.is_empty() {
        ensure_user_folder(folder)?;
    }
    let file = format!("{name}.{}", kind.extension());
    let rel = if folder.is_empty() {
        file
    } else {
        format!("{folder}/{file}")
    };
    let path = resolve_new(root, &rel)?;
    if path.symlink_metadata().is_ok() {
        return Err(AppError::AlreadyExists(path));
    }
    atomic_write(&path, bytes)?;
    Ok(rel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nresto";
    const JPEG: &[u8] = &[0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];

    #[test]
    fn guarda_con_la_extension_de_lo_que_es_de_verdad() {
        let dir = TempDir::new().unwrap();
        let rel = save_image(dir.path(), "", "captura-1", PNG).unwrap();
        assert_eq!(rel, "captura-1.png");
        assert_eq!(std::fs::read(dir.path().join(&rel)).unwrap(), PNG);
        // In a folder that doesn't exist yet.
        let rel = save_image(dir.path(), "figuras/cap1", "foto", JPEG).unwrap();
        assert_eq!(rel, "figuras/cap1/foto.jpg");
        assert!(dir.path().join(rel).is_file());
    }

    #[test]
    fn nunca_sobrescribe() {
        let dir = TempDir::new().unwrap();
        save_image(dir.path(), "", "a", PNG).unwrap();
        let err = save_image(dir.path(), "", "a", PNG).unwrap_err();
        assert!(matches!(err, AppError::AlreadyExists(_)));
    }

    #[test]
    fn rechaza_nombres_raros_y_lo_que_no_es_imagen() {
        let dir = TempDir::new().unwrap();
        for name in [
            "",
            "con espacio",
            "tilde-é",
            "a.b",
            "../fuera",
            "-opcion",
            "x/y",
        ] {
            assert!(save_image(dir.path(), "", name, PNG).is_err(), "{name}");
        }
        assert!(save_image(dir.path(), "", "texto", b"hola").is_err());
        let big = [PNG, &vec![0; MAX_IMAGE_BYTES]].concat();
        assert!(save_image(dir.path(), "", "grande", &big).is_err());
    }

    #[test]
    fn la_carpeta_no_sale_del_proyecto_ni_entra_en_jutex() {
        let dir = TempDir::new().unwrap();
        assert!(save_image(dir.path(), "../fuera", "a", PNG).is_err());
        assert!(save_image(dir.path(), ".jutex", "a", PNG).is_err());
        assert!(save_image(dir.path(), ".git/hooks", "a", PNG).is_err());
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
    }
}

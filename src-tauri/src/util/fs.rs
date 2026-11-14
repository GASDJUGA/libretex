//! File system helpers that never lose work: atomic writes.

use crate::error::{AppError, AppResult};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Writes `contents` to `path` atomically: a temporary file in the same folder is written,
/// flushed to disk and then renamed over the target, so readers never see a half-written file.
pub fn atomic_write(path: &Path, contents: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::Other(format!("sin carpeta: {}", path.display())))?;
    fs::create_dir_all(dir).map_err(|e| AppError::io(dir, e))?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{file_name}.jutex-tmp-{}", std::process::id()));

    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(AppError::io(path, e));
    }
    Ok(())
}

/// Serializes `value` as pretty JSON and writes it atomically.
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let mut json = serde_json::to_vec_pretty(value).map_err(|source| AppError::Json {
        path: path.to_owned(),
        source,
    })?;
    json.push(b'\n');
    atomic_write(path, &json)
}

/// Reads a JSON file; `Ok(None)` if it does not exist.
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> AppResult<Option<T>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|source| AppError::Json {
                path: path.to_owned(),
                source,
            }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::io(path, e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn escribe_y_reemplaza_sin_dejar_temporales() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("sub/archivo.json");
        atomic_write(&path, b"uno").unwrap();
        atomic_write(&path, b"dos").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "dos");
        let entries: Vec<_> = fs::read_dir(path.parent().unwrap()).unwrap().collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn json_ida_y_vuelta() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("x.json");
        assert_eq!(read_json::<Vec<u32>>(&path).unwrap(), None);
        write_json(&path, &vec![1, 2, 3]).unwrap();
        assert_eq!(read_json::<Vec<u32>>(&path).unwrap(), Some(vec![1, 2, 3]));
        fs::write(&path, "no es json").unwrap();
        assert!(matches!(
            read_json::<Vec<u32>>(&path),
            Err(AppError::Json { .. })
        ));
    }
}

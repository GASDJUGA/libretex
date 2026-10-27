//! The system trash, and the list of projects LibreTeX sent there.
//!
//! The trash itself is the desktop's (Dolphin, Finder…): LibreTeX does not keep a second one.
//! `trashed.json` only remembers which trashed folders were projects, so the app can show,
//! restore or permanently delete them.

#[cfg_attr(target_os = "macos", allow(unused_imports))] // only the Linux trash and the fake
use crate::error::{AppError, AppResult};
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// An item currently in the trash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashedItem {
    /// Opaque identifier (on Linux, the path of its `.trashinfo` file).
    pub id: String,
    pub original_path: PathBuf,
}

/// Operations on a trash; `SystemTrash` in the app, a fake in tests.
pub trait TrashBin: Send + Sync {
    fn delete(&self, path: &Path) -> AppResult<()>;
    fn list(&self) -> AppResult<Vec<TrashedItem>>;
    /// Moves the item back to its original location.
    fn restore(&self, id: &str) -> AppResult<()>;
    /// Deletes the item permanently.
    fn purge(&self, id: &str) -> AppResult<()>;
}

/// The desktop's trash, through the `trash` crate.
#[cfg(not(target_os = "macos"))]
pub struct SystemTrash;

/// On macOS the `trash` crate cannot list or restore: see `platform::trash`.
#[cfg(target_os = "macos")]
pub use crate::platform::trash::SystemTrash;

#[cfg(not(target_os = "macos"))]
fn trash_error(e: trash::Error) -> AppError {
    AppError::Trash(e.to_string())
}

#[cfg(not(target_os = "macos"))]
impl SystemTrash {
    /// `data_dir` is LibreTeX's data folder (the macOS trash keeps a list there).
    pub fn new(_data_dir: &Path) -> Self {
        SystemTrash
    }

    fn find(&self, id: &str) -> AppResult<trash::TrashItem> {
        trash::os_limited::list()
            .map_err(trash_error)?
            .into_iter()
            .find(|item| item.id.to_string_lossy() == id)
            .ok_or_else(|| AppError::NotFound(PathBuf::from(id)))
    }
}

#[cfg(not(target_os = "macos"))]
impl TrashBin for SystemTrash {
    fn delete(&self, path: &Path) -> AppResult<()> {
        trash::delete(path).map_err(trash_error)
    }

    fn list(&self) -> AppResult<Vec<TrashedItem>> {
        Ok(trash::os_limited::list()
            .map_err(trash_error)?
            .into_iter()
            .map(|item| TrashedItem {
                id: item.id.to_string_lossy().into_owned(),
                original_path: item.original_path(),
            })
            .collect())
    }

    fn restore(&self, id: &str) -> AppResult<()> {
        let item = self.find(id)?;
        trash::os_limited::restore_all([item]).map_err(|e| match e {
            trash::Error::RestoreCollision { path, .. } => AppError::AlreadyExists(path),
            other => trash_error(other),
        })
    }

    fn purge(&self, id: &str) -> AppResult<()> {
        let item = self.find(id)?;
        trash::os_limited::purge_all([item]).map_err(trash_error)
    }
}

/// A project LibreTeX sent to the trash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub path: PathBuf,
    /// Milliseconds since the Unix epoch.
    pub trashed_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LogFile {
    version: u32,
    projects: Vec<LogEntry>,
}

pub fn read_log(file: &Path) -> AppResult<Vec<LogEntry>> {
    Ok(read_json::<LogFile>(file)?
        .map(|f| f.projects)
        .unwrap_or_default())
}

pub fn write_log(file: &Path, entries: &[LogEntry]) -> AppResult<()> {
    write_json(
        file,
        &LogFile {
            version: 1,
            projects: entries.to_vec(),
        },
    )
}

#[cfg(test)]
pub(crate) mod fake {
    use super::*;
    use std::fs;
    use std::sync::Mutex;

    /// A trash that moves items into a temporary folder.
    pub struct FakeTrash {
        dir: PathBuf,
        items: Mutex<Vec<(TrashedItem, PathBuf)>>,
    }

    impl FakeTrash {
        pub fn new(dir: PathBuf) -> Self {
            fs::create_dir_all(&dir).unwrap();
            Self {
                dir,
                items: Mutex::new(Vec::new()),
            }
        }

        /// Simulates the user emptying the trash from the desktop.
        pub fn empty(&self) {
            let mut items = self.items.lock().unwrap();
            for (_, stored) in items.drain(..) {
                fs::remove_dir_all(stored).unwrap();
            }
        }
    }

    impl TrashBin for FakeTrash {
        fn delete(&self, path: &Path) -> AppResult<()> {
            let mut items = self.items.lock().unwrap();
            let stored = self.dir.join(format!("{}", items.len() + 1));
            fs::rename(path, &stored).map_err(|e| AppError::io(path, e))?;
            let id = format!("fake-{}", stored.display());
            items.push((
                TrashedItem {
                    id,
                    original_path: path.to_owned(),
                },
                stored,
            ));
            Ok(())
        }

        fn list(&self) -> AppResult<Vec<TrashedItem>> {
            Ok(self
                .items
                .lock()
                .unwrap()
                .iter()
                .map(|(item, _)| item.clone())
                .collect())
        }

        fn restore(&self, id: &str) -> AppResult<()> {
            let mut items = self.items.lock().unwrap();
            let index = items
                .iter()
                .position(|(item, _)| item.id == id)
                .ok_or_else(|| AppError::NotFound(id.into()))?;
            let original = items[index].0.original_path.clone();
            if original.exists() {
                return Err(AppError::AlreadyExists(original));
            }
            let (_, stored) = items.remove(index);
            fs::rename(&stored, &original).map_err(|e| AppError::io(&original, e))
        }

        fn purge(&self, id: &str) -> AppResult<()> {
            let mut items = self.items.lock().unwrap();
            let index = items
                .iter()
                .position(|(item, _)| item.id == id)
                .ok_or_else(|| AppError::NotFound(id.into()))?;
            let (_, stored) = items.remove(index);
            fs::remove_dir_all(&stored).map_err(|e| AppError::io(&stored, e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real desktop trash with a throwaway folder. Ignored by default because it
    /// touches the user's trash; run with `cargo test -- --ignored papelera_del_sistema`.
    #[test]
    #[ignore]
    fn papelera_del_sistema_ida_y_vuelta() {
        let base = directories::BaseDirs::new()
            .unwrap()
            .cache_dir()
            .join("libretex-trash-test");
        let dir = base.join("proyecto-de-prueba");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("main.tex"), "x").unwrap();
        let dir = dir.canonicalize().unwrap();
        let bin = SystemTrash::new(&base);

        bin.delete(&dir).unwrap();
        assert!(!dir.exists());
        let item = bin
            .list()
            .unwrap()
            .into_iter()
            .find(|i| i.original_path == dir)
            .unwrap();

        bin.restore(&item.id).unwrap();
        assert!(dir.join("main.tex").is_file());

        bin.delete(&dir).unwrap();
        let item = bin
            .list()
            .unwrap()
            .into_iter()
            .find(|i| i.original_path == dir)
            .unwrap();
        bin.purge(&item.id).unwrap();
        assert!(bin.list().unwrap().iter().all(|i| i.original_path != dir));
        // On macOS the id is where the item is in the trash: it must be gone from there.
        #[cfg(target_os = "macos")]
        assert!(
            std::fs::symlink_metadata(&item.id).is_err(),
            "sigue en la papelera: {}",
            item.id
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn el_registro_de_la_papelera_persiste() {
        let tmp = tempfile::TempDir::new().unwrap();
        let file = tmp.path().join("trashed.json");
        assert!(read_log(&file).unwrap().is_empty());
        let entry = LogEntry {
            path: "/p/x".into(),
            trashed_at: 7,
        };
        write_log(&file, std::slice::from_ref(&entry)).unwrap();
        assert_eq!(read_log(&file).unwrap(), vec![entry]);
    }
}

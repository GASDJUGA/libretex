//! The macOS trash.
//!
//! macOS has no API to list the trash or put items back, and `~/.Trash` cannot be read
//! without Full Disk Access. But `NSFileManager` says where each item lands, and that one path
//! can be read and moved. So LibreTeX remembers where it sent each item (`trash-locations.json`
//! in its data folder): listing keeps those still in the trash, restoring moves one back and
//! purging deletes it. Finder still shows them in its Trash (and is told when they leave it).
//!
//! `trash::delete` is not used: by default it asks Finder through AppleScript, which needs the
//! user's permission to control Finder.

use crate::error::{AppError, AppResult};
use crate::projects::trash::{TrashBin, TrashedItem};
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Location {
    /// Where the item is now, inside a trash folder.
    trashed: PathBuf,
    original: PathBuf,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LocationsFile {
    version: u32,
    items: Vec<Location>,
}

/// The user's trash, through `NSFileManager`.
pub struct SystemTrash {
    locations_file: PathBuf,
    lock: Mutex<()>,
    move_to_trash: fn(&Path) -> AppResult<PathBuf>,
}

impl SystemTrash {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            locations_file: data_dir.join("trash-locations.json"),
            lock: Mutex::new(()),
            move_to_trash: ns_trash,
        }
    }

    /// The remembered items still in the trash; the others (emptied or put back from Finder)
    /// are forgotten.
    fn read(&self) -> AppResult<Vec<Location>> {
        let items = read_json::<LocationsFile>(&self.locations_file)?
            .map(|f| f.items)
            .unwrap_or_default();
        let kept: Vec<Location> = items
            .iter()
            .filter(|l| fs::symlink_metadata(&l.trashed).is_ok())
            .cloned()
            .collect();
        if kept.len() != items.len() {
            self.write(&kept)?;
        }
        Ok(kept)
    }

    fn write(&self, items: &[Location]) -> AppResult<()> {
        write_json(
            &self.locations_file,
            &LocationsFile {
                version: 1,
                items: items.to_vec(),
            },
        )
    }

    /// Takes the item out of the list; it must be there.
    fn take(&self, id: &str) -> AppResult<(Location, Vec<Location>)> {
        let mut items = self.read()?;
        let index = items
            .iter()
            .position(|l| l.trashed.as_os_str() == id)
            .ok_or_else(|| AppError::NotFound(PathBuf::from(id)))?;
        let item = items.remove(index);
        Ok((item, items))
    }
}

impl TrashBin for SystemTrash {
    fn delete(&self, path: &Path) -> AppResult<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let trashed = (self.move_to_trash)(path)?;
        let mut items = self.read()?;
        items.retain(|l| l.trashed != trashed);
        items.push(Location {
            trashed,
            original: path.to_owned(),
        });
        self.write(&items)
    }

    fn list(&self) -> AppResult<Vec<TrashedItem>> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        Ok(self
            .read()?
            .into_iter()
            .map(|l| TrashedItem {
                id: l.trashed.to_string_lossy().into_owned(),
                original_path: l.original,
            })
            .collect())
    }

    fn restore(&self, id: &str) -> AppResult<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let (item, rest) = self.take(id)?;
        if fs::symlink_metadata(&item.original).is_ok() {
            return Err(AppError::AlreadyExists(item.original));
        }
        if let Some(parent) = item.original.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
        }
        fs::rename(&item.trashed, &item.original).map_err(|e| AppError::io(&item.original, e))?;
        note_changed(&item.trashed);
        self.write(&rest)
    }

    fn purge(&self, id: &str) -> AppResult<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let (item, rest) = self.take(id)?;
        let removed = if fs::symlink_metadata(&item.trashed).is_ok_and(|m| m.is_dir()) {
            fs::remove_dir_all(&item.trashed)
        } else {
            fs::remove_file(&item.trashed)
        };
        removed.map_err(|e| AppError::io(&item.trashed, e))?;
        note_changed(&item.trashed);
        self.write(&rest)
    }
}

/// Tells Finder that the folder holding `path` changed: an open Trash window otherwise may
/// keep showing an item that LibreTeX deleted or put back.
fn note_changed(path: &Path) {
    if let Some(folder) = path.parent().and_then(Path::to_str) {
        objc2_app_kit::NSWorkspace::sharedWorkspace()
            .noteFileSystemChanged_(&objc2_foundation::NSString::from_str(folder));
    }
}

/// Moves `path` to the trash of its volume and returns where it landed.
fn ns_trash(path: &Path) -> AppResult<PathBuf> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};

    let text = path
        .to_str()
        .ok_or_else(|| AppError::Trash(format!("ruta no válida: {}", path.display())))?;
    let url = NSURL::fileURLWithPath(&NSString::from_str(text));
    let mut resulting = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut resulting))
        .map_err(|e| AppError::Trash(e.localizedDescription().to_string()))?;
    resulting
        .and_then(|u| u.path())
        .map(|p| PathBuf::from(p.to_string()))
        .ok_or_else(|| AppError::Trash(format!("sin destino en la papelera: {}", path.display())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Moves the item into a `papelera` folder next to it, as `NSFileManager` would (with a
    /// number when the name is taken).
    fn fake_trash(path: &Path) -> AppResult<PathBuf> {
        let bin = path.parent().unwrap().join("papelera");
        fs::create_dir_all(&bin).unwrap();
        let name = path.file_name().unwrap().to_string_lossy();
        let mut target = bin.join(&*name);
        let mut n = 2;
        while target.exists() {
            target = bin.join(format!("{name} {n}"));
            n += 1;
        }
        fs::rename(path, &target).map_err(|e| AppError::io(path, e))?;
        Ok(target)
    }

    fn trash(tmp: &TempDir) -> SystemTrash {
        SystemTrash {
            move_to_trash: fake_trash,
            ..SystemTrash::new(&tmp.path().join("datos"))
        }
    }

    fn project(tmp: &TempDir, name: &str) -> PathBuf {
        let dir = tmp.path().join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("main.tex"), name).unwrap();
        dir
    }

    #[test]
    fn enviar_listar_y_restaurar() {
        let tmp = TempDir::new().unwrap();
        let bin = trash(&tmp);
        let dir = project(&tmp, "tesis");

        bin.delete(&dir).unwrap();
        assert!(!dir.exists());
        let items = bin.list().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].original_path, dir);

        bin.restore(&items[0].id).unwrap();
        assert_eq!(fs::read_to_string(dir.join("main.tex")).unwrap(), "tesis");
        assert!(bin.list().unwrap().is_empty());
    }

    #[test]
    fn eliminar_definitivamente() {
        let tmp = TempDir::new().unwrap();
        let bin = trash(&tmp);
        let dir = project(&tmp, "tesis");
        let file = tmp.path().join("nota.txt");
        fs::write(&file, "x").unwrap();
        bin.delete(&dir).unwrap();
        bin.delete(&file).unwrap();

        for item in bin.list().unwrap() {
            bin.purge(&item.id).unwrap();
        }
        assert!(bin.list().unwrap().is_empty());
        assert_eq!(
            fs::read_dir(tmp.path().join("papelera")).unwrap().count(),
            0
        );
    }

    #[test]
    fn lo_vaciado_o_devuelto_desde_finder_se_olvida() {
        let tmp = TempDir::new().unwrap();
        let bin = trash(&tmp);
        let a = project(&tmp, "a");
        let b = project(&tmp, "b");
        bin.delete(&a).unwrap();
        bin.delete(&b).unwrap();
        let items = bin.list().unwrap();
        fs::remove_dir_all(&items[0].id).unwrap();

        let items = bin.list().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].original_path, b);
        assert!(
            bin.restore(&tmp.path().join("papelera/a").to_string_lossy())
                .is_err()
        );
    }

    #[test]
    fn mismo_nombre_dos_veces() {
        let tmp = TempDir::new().unwrap();
        let bin = trash(&tmp);
        let dir = project(&tmp, "tesis");
        bin.delete(&dir).unwrap();
        let dir = project(&tmp, "tesis");
        bin.delete(&dir).unwrap();
        assert_eq!(bin.list().unwrap().len(), 2);

        let first = bin.list().unwrap()[0].id.clone();
        bin.restore(&first).unwrap();
        let second = bin.list().unwrap()[0].id.clone();
        assert!(matches!(
            bin.restore(&second),
            Err(AppError::AlreadyExists(_))
        ));
        assert_eq!(bin.list().unwrap().len(), 1);
    }

    #[test]
    fn solo_lo_que_libretex_envio() {
        let tmp = TempDir::new().unwrap();
        let bin = trash(&tmp);
        let otro = tmp.path().join("ajeno");
        fs::write(&otro, "x").unwrap();
        assert!(matches!(
            bin.purge(&otro.to_string_lossy()),
            Err(AppError::NotFound(_))
        ));
        assert!(otro.exists());
    }
}

//! The list of known projects, stored in `~/.config/libretex/projects.json`.

use crate::error::AppResult;
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub path: PathBuf,
    /// Milliseconds since the Unix epoch.
    pub opened_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct RegistryFile {
    version: u32,
    projects: Vec<Entry>,
}

#[derive(Debug)]
pub struct Registry {
    file: PathBuf,
    pub entries: Vec<Entry>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Registry {
    pub fn load(file: &Path) -> AppResult<Self> {
        let entries = read_json::<RegistryFile>(file)?
            .map(|f| f.projects)
            .unwrap_or_default();
        Ok(Self {
            file: file.to_owned(),
            entries,
        })
    }

    pub fn save(&self) -> AppResult<()> {
        write_json(
            &self.file,
            &RegistryFile {
                version: VERSION,
                projects: self.entries.clone(),
            },
        )
    }

    pub fn get(&self, id: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Entry> {
        self.entries.iter_mut().find(|e| e.id == id)
    }

    pub fn find_by_path(&self, path: &Path) -> Option<&Entry> {
        self.entries.iter().find(|e| e.path == path)
    }

    /// Registers `path` (already canonical) and returns its entry; an already registered
    /// path keeps its id.
    pub fn add(&mut self, path: PathBuf) -> Entry {
        if let Some(existing) = self.find_by_path(&path) {
            return existing.clone();
        }
        let entry = Entry {
            id: self.new_id(),
            path,
            opened_at: None,
        };
        self.entries.push(entry.clone());
        entry
    }

    pub fn remove(&mut self, id: &str) -> Option<Entry> {
        let index = self.entries.iter().position(|e| e.id == id)?;
        Some(self.entries.remove(index))
    }

    fn new_id(&self) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut n = nanos ^ ((std::process::id() as u128) << 64);
        loop {
            let id = format!("{:012x}", n & 0xffff_ffff_ffff);
            if self.get(&id).is_none() {
                return id;
            }
            n = n.wrapping_add(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn persiste_y_no_duplica_rutas() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("config/projects.json");
        let mut reg = Registry::load(&file).unwrap();
        assert!(reg.entries.is_empty());

        let a = reg.add("/p/a".into());
        let b = reg.add("/p/b".into());
        assert_ne!(a.id, b.id);
        assert_eq!(reg.add("/p/a".into()).id, a.id);
        reg.get_mut(&a.id).unwrap().opened_at = Some(42);
        reg.save().unwrap();

        let reg = Registry::load(&file).unwrap();
        assert_eq!(reg.entries.len(), 2);
        assert_eq!(reg.get(&a.id).unwrap().opened_at, Some(42));
        let raw = std::fs::read_to_string(&file).unwrap();
        assert!(
            raw.contains("\"openedAt\": 42") && raw.contains("\"version\": 1"),
            "{raw}"
        );
    }

    #[test]
    fn quita_entradas() {
        let tmp = TempDir::new().unwrap();
        let mut reg = Registry::load(&tmp.path().join("p.json")).unwrap();
        let a = reg.add("/p/a".into());
        assert_eq!(
            reg.remove(&a.id).map(|e| e.path),
            Some(PathBuf::from("/p/a"))
        );
        assert!(reg.remove(&a.id).is_none());
    }
}

//! Watches a project folder for changes made outside JuTeX (another editor, git, the file
//! manager) and reports the affected paths, relative to the root.

use crate::error::{AppError, AppResult};
use crate::projects::meta::is_meta_dir;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Component, Path};
use std::sync::mpsc;
use std::time::Duration;

/// Bursts of events (an atomic save produces several) are grouped over this window.
pub const DEBOUNCE: Duration = Duration::from_millis(150);

/// Marker of the temporary files written by `util::fs::atomic_write`.
const TMP_MARKER: &str = ".jutex-tmp-";

/// Keeps the watch alive; dropping it stops watching (and ends the debounce thread).
pub struct ProjectWatcher {
    _watcher: RecommendedWatcher,
}

/// Path of `path` relative to `root` if it is something the user cares about: not inside
/// `.jutex/` or `.git/`, and not one of our temporary files.
pub fn relevant(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in rel.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            _ => return None,
        }
    }
    let first = parts.first()?;
    if is_meta_dir(first) || first == ".git" {
        return None;
    }
    if parts.last().is_some_and(|name| name.contains(TMP_MARKER)) {
        return None;
    }
    Some(parts.join("/"))
}

/// Starts watching `root` recursively; `on_change` receives, after each burst of events, the
/// sorted relative paths that changed (created, modified, renamed or deleted).
pub fn watch<F>(root: &Path, on_change: F) -> AppResult<ProjectWatcher>
where
    F: Fn(Vec<String>) + Send + 'static,
{
    let root = dunce::canonicalize(root).map_err(|e| AppError::io(root, e))?;
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher =
        notify::recommended_watcher(tx).map_err(|e| AppError::Other(e.to_string()))?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| AppError::Other(e.to_string()))?;

    std::thread::Builder::new()
        .name("jutex-watch".into())
        .spawn(move || debounce_loop(&root, &rx, &on_change))
        .map_err(|e| AppError::Other(e.to_string()))?;

    Ok(ProjectWatcher { _watcher: watcher })
}

fn debounce_loop<F: Fn(Vec<String>)>(
    root: &Path,
    rx: &mpsc::Receiver<notify::Result<notify::Event>>,
    on_change: &F,
) {
    let collect = |event: notify::Result<notify::Event>, changed: &mut BTreeSet<String>| {
        let Ok(event) = event else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        changed.extend(event.paths.iter().filter_map(|p| relevant(root, p)));
    };
    // `recv` fails once the watcher (the sender) is dropped: the thread then ends.
    while let Ok(first) = rx.recv() {
        let mut changed = BTreeSet::new();
        collect(first, &mut changed);
        while let Ok(next) = rx.recv_timeout(DEBOUNCE) {
            collect(next, &mut changed);
        }
        if !changed.is_empty() {
            on_change(changed.into_iter().collect());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;
    use tempfile::TempDir;

    #[test]
    fn filtra_rutas_internas_y_temporales() {
        let root = Path::new("/p");
        assert_eq!(
            relevant(root, Path::new("/p/main.tex")).as_deref(),
            Some("main.tex")
        );
        assert_eq!(
            relevant(root, Path::new("/p/caps/1.tex")).as_deref(),
            Some("caps/1.tex")
        );
        for ignored in [
            "/p",
            "/p/.jutex/build/main.pdf",
            "/p/.git/index",
            "/p/caps/.1.tex.jutex-tmp-123",
            "/otro/main.tex",
        ] {
            assert_eq!(relevant(root, Path::new(ignored)), None, "{ignored}");
        }
    }

    /// Waits until `seen` contains `wanted` (the real watcher is asynchronous).
    fn wait_for(seen: &Arc<Mutex<Vec<String>>>, wanted: &str) -> bool {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(5) {
            if seen.lock().unwrap().iter().any(|p| p == wanted) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        false
    }

    #[test]
    fn informa_cambios_externos_e_ignora_los_internos() {
        let tmp = TempDir::new().unwrap();
        let root = dunce::canonicalize(tmp.path()).unwrap();
        fs::create_dir_all(root.join(".jutex/build")).unwrap();
        fs::create_dir_all(root.join("caps")).unwrap();

        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let watcher = watch(&root, move |paths| sink.lock().unwrap().extend(paths)).unwrap();

        fs::write(root.join(".jutex/build/main.log"), "x").unwrap();
        fs::write(root.join("caps/1.tex"), "hola").unwrap();
        assert!(wait_for(&seen, "caps/1.tex"), "{:?}", seen.lock().unwrap());

        crate::util::fs::atomic_write(&root.join("main.tex"), b"y").unwrap();
        assert!(wait_for(&seen, "main.tex"), "{:?}", seen.lock().unwrap());

        fs::remove_file(root.join("caps/1.tex")).unwrap();
        seen.lock().unwrap().clear();
        assert!(
            wait_for(&seen, "caps/1.tex"),
            "borrado: {:?}",
            seen.lock().unwrap()
        );

        let all = seen.lock().unwrap().clone();
        assert!(
            all.iter()
                .all(|p| !p.starts_with(".jutex") && !p.contains(TMP_MARKER)),
            "{all:?}"
        );
        drop(watcher);
    }
}
